import { Injectable } from '@nestjs/common';
import type { estado_reclamacion } from '../../generated/prisma/client.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { Tx } from '../publicaciones/publicaciones.repository.js';

export interface PublicacionReclamable {
  titulo: string;
  tipo: 'PERDIDO' | 'ENCONTRADO';
  estado: string;
  id_usuario: number;
}

export interface ReclamacionBloqueada {
  id: number;
  id_publicacion: number;
  id_reclamante: number;
  estado: estado_reclamacion;
  id_autor: number; // autor de la publicación reclamada
  titulo: string; // para los avisos
}

export interface EntregaBloqueada {
  id: number;
  confirmo_autor: boolean;
  confirmo_reclamante: boolean;
  fecha_entrega: Date | null;
}

@Injectable()
export class ReclamacionesRepository {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(trabajo: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(trabajo);
  }

  publicacion(id: number): Promise<PublicacionReclamable | null> {
    return this.prisma.publicacion.findFirst({
      where: { id, oculta: false },
      select: { titulo: true, tipo: true, estado: true, id_usuario: true },
    });
  }

  async crear(datos: {
    id_publicacion: number;
    id_reclamante: number;
    respuesta_detalle: string;
    evidencia_url?: string | null;
  }): Promise<{ id: number }> {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.reclamacion.create({ data: datos, select: { id: true } });
      // Una reclamación cuenta como actividad: aleja la expiración de 90 días.
      await tx.publicacion.update({
        where: { id: datos.id_publicacion },
        data: { ultima_actividad: new Date() },
      });
      return r;
    });
  }

  // Para que el autor decida (RF-19): la respuesta de cada reclamante junto al
  // detalle reservado. Es el ÚNICO lugar donde se lee detalle_reservado (§6.3).
  async paraElAutor(id_publicacion: number) {
    const [detalle, reclamaciones] = await Promise.all([
      this.prisma.detalle_reservado.findUnique({
        where: { id_publicacion },
        select: { texto: true },
      }),
      this.prisma.reclamacion.findMany({
        where: { id_publicacion },
        select: {
          id: true,
          respuesta_detalle: true,
          evidencia_url: true,
          estado: true,
          fecha: true,
          fecha_resolucion: true,
          reclamante: { select: { id: true, nombre: true } },
        },
        orderBy: { fecha: 'asc' },
      }),
    ]);
    return { detalle_reservado: detalle?.texto ?? null, reclamaciones };
  }

  // Ficha de una reclamación para sus dos partes: quién es quién y en qué va la entrega.
  // Sin respuesta_detalle ni detalle reservado (eso solo en paraElAutor).
  detalle(id: number) {
    return this.prisma.reclamacion.findUnique({
      where: { id },
      select: {
        id: true,
        estado: true,
        fecha: true,
        fecha_resolucion: true,
        publicacion: {
          select: {
            id: true,
            titulo: true,
            estado: true,
            usuario: { select: { id: true, nombre: true } },
          },
        },
        reclamante: { select: { id: true, nombre: true } },
        entrega: {
          select: { confirmo_autor: true, confirmo_reclamante: true, fecha_entrega: true },
        },
      },
    });
  }

  // FOR UPDATE OF r: bloquea la reclamación (no la publicación: esa la bloquea
  // cambiarEstadoEn). Así dos "aceptar" simultáneos sobre la misma no se pisan.
  async bloquear(tx: Tx, id: number): Promise<ReclamacionBloqueada | null> {
    const filas = await tx.$queryRaw<ReclamacionBloqueada[]>`
      SELECT r.id, r.id_publicacion, r.id_reclamante, r.estado, p.id_usuario AS id_autor, p.titulo
      FROM reclamacion r JOIN publicacion p ON p.id = r.id_publicacion
      WHERE r.id = ${id}
      FOR UPDATE OF r`;
    return filas[0] ?? null;
  }

  // fecha_resolucion = now() de la BD: se compara con `fecha` (también de la BD)
  // en chk_reclamacion_fechas. Mismo reloj (regla de fechas).
  async resolver(
    tx: Tx,
    id: number,
    estado: 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA',
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE reclamacion
      SET estado = ${estado}::estado_reclamacion, fecha_resolucion = now()
      WHERE id = ${id}`;
  }

  async crearEntregaVacia(tx: Tx, id_reclamacion: number): Promise<void> {
    await tx.entrega.create({ data: { id_reclamacion } });
  }

  async bloquearEntrega(tx: Tx, id_reclamacion: number): Promise<EntregaBloqueada | null> {
    const filas = await tx.$queryRaw<EntregaBloqueada[]>`
      SELECT id, confirmo_autor, confirmo_reclamante, fecha_entrega
      FROM entrega WHERE id_reclamacion = ${id_reclamacion}
      FOR UPDATE`;
    return filas[0] ?? null;
  }

  // Las dos marcas y la fecha en UN solo UPDATE: chk_entrega_doble_confirmacion
  // exige fecha_entrega si y solo si las dos partes confirmaron.
  async guardarConfirmacion(
    tx: Tx,
    id_entrega: number,
    confirmo_autor: boolean,
    confirmo_reclamante: boolean,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE entrega
      SET confirmo_autor = ${confirmo_autor},
          confirmo_reclamante = ${confirmo_reclamante},
          fecha_entrega = CASE WHEN ${confirmo_autor} AND ${confirmo_reclamante} THEN now() END
      WHERE id = ${id_entrega}`;
  }
}
