import { HttpStatus, Injectable } from '@nestjs/common';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import { esEditable } from './estados.js';
import type { DatosCrear, DatosEditar } from './gestion.schemas.js';
import { GestionRepository } from './gestion.repository.js';
import { PublicacionesService } from './publicaciones.service.js';
import { PublicacionesRepository, type Tx } from './publicaciones.repository.js';

export interface Contexto {
  usuario: UsuarioSesion;
  ip: string | null;
}

// Error 400 con el campo marcado, igual que los de ValidacionZod: el formulario
// lo muestra junto al campo, aunque la regla se haya revisado aquí y no en Zod.
const campoInvalido = (campo: string, mensaje: string) =>
  new ErrorApp(HttpStatus.BAD_REQUEST, 'SOLICITUD_INVALIDA', 'Revisa los datos enviados.', [
    { campo, mensaje },
  ]);

const noEncontrada = () =>
  new ErrorApp(HttpStatus.NOT_FOUND, 'PUBLICACION_NO_ENCONTRADA', 'La publicación no existe.');

@Injectable()
export class GestionService {
  constructor(
    private readonly repo: GestionRepository,
    // Un solo lugar escribe historial_estado: el repositorio del módulo de publicaciones.
    private readonly repoPublicaciones: PublicacionesRepository,
    private readonly publicaciones: PublicacionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // RF-06 / RF-07: crear un ENCONTRADO o un PERDIDO.
  async crear(datos: DatosCrear, ctx: Contexto) {
    const ahora = new Date();
    if (datos.fecha_suceso.getTime() > ahora.getTime()) {
      throw campoInvalido('fecha_suceso', 'La fecha no puede estar en el futuro');
    }

    return this.repo.enTransaccion(async (tx) => {
      const sensible = await this.revisarCatalogos(tx, datos.id_categoria, datos.id_lugar);
      const { id } = await this.repo.crear(tx, {
        id_usuario: ctx.usuario.id,
        id_categoria: datos.id_categoria,
        id_lugar: datos.id_lugar,
        tipo: datos.tipo,
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        fecha_suceso: datos.fecha_suceso,
        ahora,
      });
      if (datos.tipo === 'ENCONTRADO') {
        await this.repo.guardarDetalle(tx, id, datos.detalle_reservado);
      }
      await this.repoPublicaciones.agregarHistorial(tx, {
        id_publicacion: id,
        estado_anterior: null, // el CHECK permite NULL solo en el primer registro
        estado_nuevo: 'ACTIVA',
        id_usuario: ctx.usuario.id,
        motivo: 'Publicación creada',
      });
      await this.auditoria.registrar(
        {
          accion: 'PUBLICACION_CREADA',
          entidad: 'publicacion',
          id_entidad: id,
          id_usuario: ctx.usuario.id,
          detalle: { tipo: datos.tipo }, // nunca el texto del detalle reservado
          ip: ctx.ip,
        },
        tx,
      );
      const publicacion = await this.repo.resumen(tx, id);
      // Regla 6.6: si la categoría es sensible, el frontend muestra el aviso de tapar datos.
      return { ...publicacion, aviso_sensible: sensible };
    });
  }

  // RF-10: el autor edita mientras la publicación no esté en un estado final.
  async editar(id: number, datos: DatosEditar, ctx: Contexto) {
    const ahora = new Date();
    return this.repo.enTransaccion(async (tx) => {
      const actual = await this.repo.paraEditar(tx, id);
      if (!actual) throw noEncontrada();
      if (actual.id_usuario !== ctx.usuario.id) {
        throw new ErrorApp(
          HttpStatus.FORBIDDEN,
          'PROHIBIDO',
          'Solo el autor puede editar esta publicación.',
        );
      }
      if (!esEditable(actual.estado)) {
        throw new ErrorApp(
          HttpStatus.CONFLICT,
          'PUBLICACION_NO_EDITABLE',
          `Una publicación ${actual.estado} ya no se puede editar.`,
        );
      }

      const { detalle_reservado, ...cambios } = datos;
      if (detalle_reservado !== undefined) {
        if (actual.tipo === 'PERDIDO') {
          throw campoInvalido(
            'detalle_reservado',
            'Un objeto perdido no lleva detalle reservado (solo los encontrados)',
          );
        }
        // Si ya alguien reclamó, cambiar el detalle permitiría "ajustarlo" a la
        // respuesta de un reclamante (para aceptarla o para rechazarla).
        if (actual.reclamaciones > 0) {
          throw new ErrorApp(
            HttpStatus.CONFLICT,
            'DETALLE_BLOQUEADO',
            'El detalle reservado no se puede cambiar porque ya hay reclamaciones.',
          );
        }
      }
      // CHECK de la BD: fecha_suceso <= fecha_creacion (la de la publicación, no "ahora").
      if (
        cambios.fecha_suceso &&
        cambios.fecha_suceso.getTime() > actual.fecha_creacion.getTime()
      ) {
        throw campoInvalido(
          'fecha_suceso',
          'La fecha no puede ser posterior al momento en que publicaste',
        );
      }
      if (cambios.id_categoria !== undefined || cambios.id_lugar !== undefined) {
        await this.revisarCatalogos(tx, cambios.id_categoria, cambios.id_lugar);
      }

      await this.repo.actualizar(tx, id, cambios, ahora);
      if (detalle_reservado !== undefined) {
        await this.repo.guardarDetalle(tx, id, detalle_reservado);
      }
      await this.auditoria.registrar(
        {
          accion: 'PUBLICACION_EDITADA',
          entidad: 'publicacion',
          id_entidad: id,
          id_usuario: ctx.usuario.id,
          // Solo QUÉ campos cambiaron, no sus valores (el detalle reservado nunca se guarda aquí).
          detalle: {
            campos: Object.keys(datos).filter((k) => datos[k as keyof DatosEditar] !== undefined),
          },
          ip: ctx.ip,
        },
        tx,
      );
      return this.repo.resumen(tx, id);
    });
  }

  // DELETE: retirar (cambia el estado; la fila NO se borra). Autor, moderador o admin.
  async retirar(id: number, ctx: Contexto) {
    const autor = await this.repo.autorDe(id);
    if (autor === null) throw noEncontrada();
    const esAutor = autor === ctx.usuario.id;
    const esModeracion = ctx.usuario.rol === 'MODERADOR' || ctx.usuario.rol === 'ADMIN';
    if (!esAutor && !esModeracion) {
      throw new ErrorApp(
        HttpStatus.FORBIDDEN,
        'PROHIBIDO',
        'Solo el autor o un moderador pueden retirar esta publicación.',
      );
    }
    // La máquina de estados (del módulo de publicaciones) decide si se puede: por
    // ejemplo, una ENTREGADA no se retira (409 TRANSICION_INVALIDA).
    const cambio = await this.publicaciones.cambiarEstado(id, 'RETIRADA', {
      id_usuario: ctx.usuario.id,
      ip: ctx.ip,
      motivo: esAutor ? 'Retirada por el autor' : 'Retirada por moderación',
    });
    return { id, estado: cambio.hacia };
  }

  // Devuelve si la categoría es sensible. Lanza 400 con el campo marcado si algo no sirve.
  private async revisarCatalogos(tx: Tx, idCategoria?: number, idLugar?: number) {
    let sensible = false;
    if (idCategoria !== undefined) {
      const cat = await this.repo.categoria(tx, idCategoria);
      if (!cat || !cat.activa) throw campoInvalido('id_categoria', 'Elige una categoría válida');
      sensible = cat.sensible;
    }
    if (idLugar !== undefined && !(await this.repo.lugarExiste(tx, idLugar))) {
      throw campoInvalido('id_lugar', 'Elige un lugar válido');
    }
    return sensible;
  }
}
