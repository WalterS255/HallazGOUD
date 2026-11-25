import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { EstadoPublicacion } from './estados.js';
import type { Tx } from './publicaciones.repository.js';

// Acceso a la BD para crear y editar publicaciones. Sin reglas de negocio.
// Regla 6.3: columnas explícitas; el texto del detalle reservado nunca sale de aquí.

/** Nombre del lugar de cada sede donde quedan las publicaciones con ubicación escrita. */
export const LUGAR_GENERAL = 'General';

export interface ParaEditar {
  id_usuario: number;
  tipo: 'PERDIDO' | 'ENCONTRADO';
  estado: EstadoPublicacion;
  fecha_creacion: Date;
  reclamaciones: number;
}

@Injectable()
export class GestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }

  async categoria(tx: Tx, id: number) {
    return tx.categoria.findUnique({ where: { id }, select: { activa: true, sensible: true } });
  }

  async lugarExiste(tx: Tx, id: number): Promise<boolean> {
    return (await tx.lugar.count({ where: { id } })) === 1;
  }

  // El lugar "General" de una sede: donde quedan las publicaciones que llegan con
  // sede + ubicación escrita. Se crea la primera vez. null si la sede no existe.
  async lugarGeneral(tx: Tx, idSede: number): Promise<number | null> {
    if ((await tx.sede.count({ where: { id: idSede } })) === 0) return null;
    // upsert (INSERT ... ON CONFLICT): dos publicaciones a la vez no chocan al crearlo.
    const lugar = await tx.lugar.upsert({
      where: { id_sede_edificio: { id_sede: idSede, edificio: LUGAR_GENERAL } },
      create: { id_sede: idSede, edificio: LUGAR_GENERAL },
      update: {},
      select: { id: true },
    });
    return lugar.id;
  }

  async crear(
    tx: Tx,
    datos: {
      id_usuario: number;
      id_categoria: number;
      id_lugar: number;
      ubicacion?: string | null;
      pista?: string | null;
      tipo: 'PERDIDO' | 'ENCONTRADO';
      titulo: string;
      descripcion: string;
      fecha_suceso: Date;
      ahora: Date;
    },
  ): Promise<{ id: number }> {
    const { ahora, ...resto } = datos;
    return tx.publicacion.create({
      // Las fechas salen del reloj de Node (no del DEFAULT now() de PostgreSQL): así
      // el CHECK fecha_suceso <= fecha_creacion compara dos fechas del mismo reloj.
      data: { ...resto, fecha_creacion: ahora, ultima_actividad: ahora },
      select: { id: true },
    });
  }

  async guardarDetalle(tx: Tx, id_publicacion: number, texto: string): Promise<void> {
    await tx.detalle_reservado.upsert({
      where: { id_publicacion },
      create: { id_publicacion, texto },
      update: { texto },
      select: { id_publicacion: true },
    });
  }

  // FOR UPDATE bloquea la fila hasta que termine la transacción: si al mismo tiempo
  // alguien acepta una reclamación (que cambia el estado), una de las dos espera.
  async paraEditar(tx: Tx, id: number): Promise<ParaEditar | null> {
    const filas = await tx.$queryRaw<Omit<ParaEditar, 'reclamaciones'>[]>`
      SELECT id_usuario, tipo::text AS tipo, estado::text AS estado, fecha_creacion
      FROM publicacion WHERE id = ${id} FOR UPDATE`;
    const fila = filas[0];
    if (!fila) return null;
    const reclamaciones = await tx.reclamacion.count({ where: { id_publicacion: id } });
    return { ...fila, reclamaciones };
  }

  async autorDe(id: number): Promise<number | null> {
    const p = await this.prisma.publicacion.findUnique({
      where: { id },
      select: { id_usuario: true },
    });
    return p?.id_usuario ?? null;
  }

  async actualizar(
    tx: Tx,
    id: number,
    datos: Partial<{
      titulo: string;
      descripcion: string;
      id_categoria: number;
      id_lugar: number;
      ubicacion: string;
      pista: string | null;
      fecha_suceso: Date;
    }>,
    ahora: Date,
  ): Promise<void> {
    await tx.publicacion.update({
      where: { id },
      // Regla 6.1: cada edición cuenta como actividad (el cron de 90 días la mira).
      data: { ...datos, ultima_actividad: ahora },
      select: { id: true },
    });
  }

  // Lo que se devuelve al autor después de crear o editar: SIN detalle reservado.
  async resumen(tx: Tx, id: number) {
    return tx.publicacion.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        tipo: true,
        titulo: true,
        descripcion: true,
        ubicacion: true,
        pista: true,
        estado: true,
        fecha_suceso: true,
        fecha_creacion: true,
        categoria: { select: { id: true, nombre: true, sensible: true } },
        lugar: {
          select: { id: true, edificio: true, sede: { select: { id: true, nombre: true } } },
        },
      },
    });
  }
}
