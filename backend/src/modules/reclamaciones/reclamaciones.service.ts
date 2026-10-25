import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import { PublicacionesService } from '../publicaciones/publicaciones.service.js';
import { ReclamacionesRepository, type ReclamacionBloqueada } from './reclamaciones.repository.js';

export type Decision = 'ACEPTAR' | 'RECHAZAR';

const prohibido = (mensaje: string) => new ErrorApp(HttpStatus.FORBIDDEN, 'PROHIBIDO', mensaje);
const conflicto = (codigo: string, mensaje: string) =>
  new ErrorApp(HttpStatus.CONFLICT, codigo, mensaje);

@Injectable()
export class ReclamacionesService {
  constructor(
    private readonly repo: ReclamacionesRepository,
    private readonly publicaciones: PublicacionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // RF-18 · §6.2
  async crear(datos: {
    id_publicacion: number;
    id_reclamante: number;
    respuesta_detalle: string;
    evidencia_url?: string | null;
  }): Promise<{ id: number }> {
    const pub = await this.repo.publicacion(datos.id_publicacion);
    if (!pub) {
      throw new ErrorApp(
        HttpStatus.NOT_FOUND,
        'PUBLICACION_NO_ENCONTRADA',
        'La publicación no existe.',
      );
    }
    if (pub.tipo !== 'ENCONTRADO') {
      throw conflicto('NO_RECLAMABLE', 'Solo se pueden reclamar objetos encontrados.');
    }
    if (pub.estado !== 'ACTIVA') {
      throw conflicto('NO_RECLAMABLE', 'Esta publicación ya no recibe reclamaciones.');
    }
    if (pub.id_usuario === datos.id_reclamante) {
      throw conflicto('RECLAMACION_PROPIA', 'No puedes reclamar tu propia publicación.');
    }
    try {
      return await this.repo.crear(datos);
    } catch (error) {
      // El índice único parcial uq_reclamacion_pendiente_por_usuario frena la segunda
      // pendiente del mismo usuario, incluso si llegan dos peticiones a la vez.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflicto(
          'RECLAMACION_DUPLICADA',
          'Ya tienes una reclamación pendiente sobre esta publicación.',
        );
      }
      throw error;
    }
  }

  // RF-19: el autor ve cada respuesta junto al detalle reservado para comparar.
  async paraElAutor(id_publicacion: number, id_solicitante: number) {
    const pub = await this.repo.publicacion(id_publicacion);
    if (!pub || pub.id_usuario !== id_solicitante) {
      // Mismo error si no existe o si no es el autor: no se revela qué publicaciones existen.
      throw prohibido('Solo el autor puede ver las reclamaciones de su publicación.');
    }
    return this.repo.paraElAutor(id_publicacion);
  }

  // RF-19 / RF-20 · §6.2: aceptar o rechazar, todo en UNA transacción.
  async resolver(
    id_reclamacion: number,
    id_autor: number,
    decision: Decision,
    ip?: string | null,
  ): Promise<void> {
    await this.repo.enTransaccion(async (tx) => {
      const r = this.pendienteDelAutor(await this.repo.bloquear(tx, id_reclamacion), id_autor);

      if (decision === 'ACEPTAR') {
        await this.repo.resolver(tx, r.id, 'ACEPTADA');
        // Si la publicación ya no está ACTIVA (otra reclamación ganó), esto lanza
        // TRANSICION_INVALIDA y la transacción entera se deshace.
        await this.publicaciones.cambiarEstadoEn(tx, r.id_publicacion, 'EN_RECLAMACION', {
          id_usuario: id_autor,
          ip,
        });
        await this.repo.crearEntregaVacia(tx, r.id); // habilita el chat y la entrega
      } else {
        await this.repo.resolver(tx, r.id, 'RECHAZADA');
      }
      // Las demás reclamaciones pendientes siguen PENDIENTE, por si la aceptada no resulta.
      await this.auditoria.registrar(
        {
          accion: decision === 'ACEPTAR' ? 'RECLAMACION_ACEPTADA' : 'RECLAMACION_RECHAZADA',
          entidad: 'reclamacion',
          id_entidad: r.id,
          id_usuario: id_autor,
          detalle: { id_publicacion: r.id_publicacion, id_reclamante: r.id_reclamante },
          ip,
        },
        tx,
      );
    });
  }

  // RF-21 · §6.5: cada parte confirma; con las dos, la publicación pasa a ENTREGADA.
  async confirmarEntrega(
    id_reclamacion: number,
    id_usuario: number,
    ip?: string | null,
  ): Promise<{ entregada: boolean }> {
    return this.repo.enTransaccion(async (tx) => {
      const r = await this.repo.bloquear(tx, id_reclamacion);
      if (!r || r.estado !== 'ACEPTADA') {
        throw conflicto('SIN_ENTREGA', 'Esta reclamación no tiene una entrega en curso.');
      }
      const esAutor = id_usuario === r.id_autor;
      const esReclamante = id_usuario === r.id_reclamante;
      if (!esAutor && !esReclamante) {
        throw prohibido('Solo las dos partes pueden confirmar la entrega.');
      }
      const entrega = await this.repo.bloquearEntrega(tx, r.id);
      if (!entrega || entrega.fecha_entrega) {
        throw conflicto('ENTREGA_CERRADA', 'La entrega ya se confirmó.');
      }

      const autor = entrega.confirmo_autor || esAutor;
      const reclamante = entrega.confirmo_reclamante || esReclamante;
      await this.repo.guardarConfirmacion(tx, entrega.id, autor, reclamante);

      const entregada = autor && reclamante;
      if (entregada) {
        await this.publicaciones.cambiarEstadoEn(tx, r.id_publicacion, 'ENTREGADA', {
          id_usuario,
          ip,
        });
        await this.auditoria.registrar(
          {
            accion: 'ENTREGA_CONFIRMADA',
            entidad: 'reclamacion',
            id_entidad: r.id,
            id_usuario,
            detalle: { id_publicacion: r.id_publicacion },
            ip,
          },
          tx,
        );
      }
      return { entregada };
    });
  }

  private pendienteDelAutor(r: ReclamacionBloqueada | null, id_autor: number) {
    if (!r || r.id_autor !== id_autor) {
      throw prohibido('Solo el autor de la publicación puede resolver sus reclamaciones.');
    }
    if (r.estado !== 'PENDIENTE') {
      throw conflicto('RECLAMACION_RESUELTA', 'Esta reclamación ya fue resuelta.');
    }
    return r;
  }
}
