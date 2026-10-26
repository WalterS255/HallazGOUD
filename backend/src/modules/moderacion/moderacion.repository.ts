import { Injectable } from '@nestjs/common';
import type { estado_reporte } from '../../generated/prisma/client.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { Tx } from '../publicaciones/publicaciones.repository.js';

export type EstadoReporte = estado_reporte;

export interface ReporteBloqueado {
  id: number;
  estado: EstadoReporte;
  id_publicacion: number;
  id_autor: number;
  titulo: string;
}

@Injectable()
export class ModeracionRepository {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(trabajo: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(trabajo);
  }

  publicacion(id: number) {
    return this.prisma.publicacion.findUnique({
      where: { id },
      select: { id_usuario: true, oculta: true },
    });
  }

  crearReporte(datos: { id_publicacion: number; id_reportante: number; motivo: string }) {
    return this.prisma.reporte.create({ data: datos, select: { id: true } });
  }

  // Bandeja del moderador: los más VIEJOS primero (el plazo es de 48 h).
  // Del reportante solo { id, nombre } (§6.3).
  listar(estado: EstadoReporte) {
    return this.prisma.reporte.findMany({
      where: { estado },
      select: {
        id: true,
        motivo: true,
        estado: true,
        fecha: true,
        fecha_resolucion: true,
        publicacion: { select: { id: true, titulo: true, estado: true, oculta: true } },
        reportante: { select: { id: true, nombre: true } },
      },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  }

  // FOR UPDATE: dos moderadores resolviendo el mismo reporte a la vez no se pisan.
  async bloquear(tx: Tx, id: number): Promise<ReporteBloqueado | null> {
    const filas = await tx.$queryRaw<ReporteBloqueado[]>`
      SELECT r.id, r.estado, r.id_publicacion, p.id_usuario AS id_autor, p.titulo
      FROM reporte r JOIN publicacion p ON p.id = r.id_publicacion
      WHERE r.id = ${id}
      FOR UPDATE OF r`;
    return filas[0] ?? null;
  }

  // fecha_resolucion = now() de la BD: se compara con `fecha` (también de la BD) en
  // chk_reporte_fechas (regla de fechas). Moderador y fecha van juntos: lo exige
  // chk_reporte_resolucion.
  async resolver(tx: Tx, id: number, estado: 'RESUELTO' | 'DESCARTADO', id_moderador: number) {
    await tx.$executeRaw`
      UPDATE reporte
      SET estado = ${estado}::estado_reporte, id_moderador = ${id_moderador}, fecha_resolucion = now()
      WHERE id = ${id}`;
  }

  // Al ocultar, los DEMÁS reportes pendientes de esa publicación ya no tienen objeto.
  async resolverPendientesDe(tx: Tx, id_publicacion: number, id_moderador: number) {
    return tx.$executeRaw`
      UPDATE reporte
      SET estado = 'RESUELTO', id_moderador = ${id_moderador}, fecha_resolucion = now()
      WHERE id_publicacion = ${id_publicacion} AND estado = 'PENDIENTE'`;
  }

  async ocultar(tx: Tx, id_publicacion: number) {
    await tx.publicacion.update({ where: { id: id_publicacion }, data: { oculta: true } });
  }
}
