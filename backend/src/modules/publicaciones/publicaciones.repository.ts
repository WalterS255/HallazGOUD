import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { EstadoPublicacion } from './estados.js';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PublicacionesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Ejecuta `trabajo` en una transacción: o se guarda TODO lo que hace, o nada.
  enTransaccion<T>(trabajo: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(trabajo);
  }

  // FOR UPDATE bloquea la fila hasta que termine la transacción: si otra petición
  // intenta cambiar la misma publicación a la vez, espera su turno y luego lee el
  // estado YA cambiado. Prisma no tiene FOR UPDATE, por eso va en SQL.
  async bloquearParaCambio(
    tx: Tx,
    id: number,
  ): Promise<{ estado: EstadoPublicacion; id_usuario: number } | null> {
    const filas = await tx.$queryRaw<{ estado: EstadoPublicacion; id_usuario: number }[]>`
      SELECT estado, id_usuario FROM publicacion WHERE id = ${id} FOR UPDATE`;
    return filas[0] ?? null;
  }

  async guardarEstado(tx: Tx, id: number, estado: EstadoPublicacion): Promise<void> {
    await tx.publicacion.update({
      where: { id },
      data: { estado, ultima_actividad: new Date() },
    });
  }

  async agregarHistorial(
    tx: Tx,
    datos: {
      id_publicacion: number;
      estado_anterior: EstadoPublicacion | null; // null solo al crear (null → ACTIVA)
      estado_nuevo: EstadoPublicacion;
      id_usuario: number | null;
      motivo: string;
    },
  ): Promise<void> {
    await tx.historial_estado.create({ data: datos });
  }
}
