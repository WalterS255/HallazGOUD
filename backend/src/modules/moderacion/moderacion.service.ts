import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { type EstadoReporte, ModeracionRepository } from './moderacion.repository.js';

export const PLAZO_HORAS = 48; // §2: el moderador tiene 48 h
export type DecisionModeracion = 'OCULTAR' | 'DESCARTAR';

const conflicto = (codigo: string, mensaje: string) =>
  new ErrorApp(HttpStatus.CONFLICT, codigo, mensaje);

@Injectable()
export class ModeracionService {
  constructor(
    private readonly repo: ModeracionRepository,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // RF-26: cualquier usuario reporta una publicación.
  async reportar(datos: {
    id_publicacion: number;
    id_reportante: number;
    motivo: string;
  }): Promise<{ id: number }> {
    const pub = await this.repo.publicacion(datos.id_publicacion);
    if (!pub || pub.oculta) {
      throw new ErrorApp(
        HttpStatus.NOT_FOUND,
        'PUBLICACION_NO_ENCONTRADA',
        'La publicación no existe.',
      );
    }
    if (pub.id_usuario === datos.id_reportante) {
      throw conflicto('REPORTE_PROPIO', 'No puedes reportar tu propia publicación.');
    }
    try {
      return await this.repo.crearReporte(datos);
    } catch (error) {
      // uq_reporte_pendiente_por_usuario (índice único parcial, Fase A).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflicto(
          'REPORTE_DUPLICADO',
          'Ya reportaste esta publicación; un moderador la está revisando.',
        );
      }
      throw error;
    }
  }

  // RF-27: bandeja del moderador, con cuántas horas lleva cada reporte.
  async bandeja(estado: EstadoReporte = 'PENDIENTE', ahora = new Date()) {
    const reportes = await this.repo.listar(estado);
    return reportes.map((r) => {
      const horas = Math.floor((ahora.getTime() - r.fecha.getTime()) / 3_600_000);
      return {
        ...r,
        horas_pendiente: horas,
        vencido: estado === 'PENDIENTE' && horas >= PLAZO_HORAS,
      };
    });
  }

  // RF-27: ocultar la publicación o descartar el reporte, en UNA transacción.
  async resolver(
    id_reporte: number,
    id_moderador: number,
    decision: DecisionModeracion,
    motivo: string | undefined,
    ip?: string | null,
  ): Promise<void> {
    const r = await this.repo.enTransaccion(async (tx) => {
      const r = await this.repo.bloquear(tx, id_reporte);
      if (!r) {
        throw new ErrorApp(HttpStatus.NOT_FOUND, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe.');
      }
      if (r.estado !== 'PENDIENTE') {
        throw conflicto('REPORTE_RESUELTO', 'Este reporte ya fue resuelto.');
      }
      if (decision === 'OCULTAR') {
        await this.repo.ocultar(tx, r.id_publicacion);
        // Este y los demás pendientes de la misma publicación quedan RESUELTOS.
        await this.repo.resolverPendientesDe(tx, r.id_publicacion, id_moderador);
      } else {
        await this.repo.resolver(tx, r.id, 'DESCARTADO', id_moderador);
      }
      await this.auditoria.registrar(
        {
          accion: decision === 'OCULTAR' ? 'MODERACION_OCULTAR' : 'MODERACION_RESOLVER',
          entidad: 'reporte',
          id_entidad: r.id,
          id_usuario: id_moderador,
          detalle: { id_publicacion: r.id_publicacion, decision, motivo: motivo ?? null },
          ip,
        },
        tx,
      );
      return r;
    });

    // RF-27: "notifica al autor". Solo cuando se oculta; si se descarta, no hay nada que contarle.
    if (decision === 'OCULTAR') {
      await this.notificaciones.avisar({
        id_usuario: r.id_autor,
        tipo: 'MODERACION',
        mensaje: `Tu publicación «${r.titulo}» fue ocultada por moderación${motivo ? `: ${motivo}` : '.'}`,
        id_referencia: r.id_publicacion,
        ruta: `/publicaciones/${r.id_publicacion}`,
      });
    }
  }
}
