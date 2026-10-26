import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { Tx } from './publicaciones.repository.js';

// Acceso a la BD para las imágenes de una publicación. Sin reglas de negocio.
@Injectable()
export class ImagenesRepository {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }

  async ordenesUsados(tx: Tx, id_publicacion: number): Promise<number[]> {
    const filas = await tx.imagen.findMany({
      where: { id_publicacion },
      select: { orden: true },
    });
    return filas.map((f) => f.orden);
  }

  async crear(
    tx: Tx,
    datos: { id_publicacion: number; url: string; url_miniatura: string; orden: number },
  ): Promise<void> {
    await tx.imagen.create({ data: datos, select: { id: true } });
  }

  async borrar(tx: Tx, id_publicacion: number, orden: number) {
    const imagen = await tx.imagen.findUnique({
      where: { id_publicacion_orden: { id_publicacion, orden } },
      select: { id: true, url: true, url_miniatura: true },
    });
    if (!imagen) return null;
    await tx.imagen.delete({ where: { id: imagen.id }, select: { id: true } });
    return imagen;
  }

  async marcarActividad(tx: Tx, id: number, ahora: Date): Promise<void> {
    await tx.publicacion.update({
      where: { id },
      data: { ultima_actividad: ahora },
      select: { id: true },
    });
  }

  async listar(tx: Tx, id_publicacion: number) {
    return tx.imagen.findMany({
      where: { id_publicacion },
      select: { url: true, url_miniatura: true, orden: true },
      orderBy: { orden: 'asc' },
    });
  }

  // ¿Se puede mostrar esta imagen al público? No, si la publicación está oculta
  // por moderación (o no existe).
  async publicacionVisible(id: number): Promise<boolean> {
    const p = await this.prisma.publicacion.findUnique({ where: { id }, select: { oculta: true } });
    return p !== null && !p.oculta;
  }
}
