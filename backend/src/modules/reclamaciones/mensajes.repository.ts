import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service.js';

export interface Hilo {
  estado: string;
  id_autor: number;
  id_reclamante: number;
  id_publicacion: number;
  entregada: boolean;
  titulo: string; // para el aviso
}

@Injectable()
export class MensajesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async hilo(id_reclamacion: number): Promise<Hilo | null> {
    const r = await this.prisma.reclamacion.findUnique({
      where: { id: id_reclamacion },
      select: {
        estado: true,
        id_reclamante: true,
        id_publicacion: true,
        publicacion: { select: { id_usuario: true, titulo: true } },
        entrega: { select: { fecha_entrega: true } },
      },
    });
    if (!r) return null;
    return {
      estado: r.estado,
      id_autor: r.publicacion.id_usuario,
      id_reclamante: r.id_reclamante,
      id_publicacion: r.id_publicacion,
      entregada: Boolean(r.entrega?.fecha_entrega),
      titulo: r.publicacion.titulo,
    };
  }

  // Lee el hilo y, en la misma transacción, marca como leído lo que mandó la OTRA parte.
  async listarYMarcarLeidos(id_reclamacion: number, id_lector: number) {
    const [mensajes] = await this.prisma.$transaction([
      this.prisma.mensaje.findMany({
        where: { id_reclamacion },
        select: {
          id: true,
          contenido: true,
          leido: true,
          fecha_envio: true,
          emisor: { select: { id: true, nombre: true } },
        },
        orderBy: [{ fecha_envio: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.mensaje.updateMany({
        where: { id_reclamacion, id_emisor: { not: id_lector }, leido: false },
        data: { leido: true },
      }),
    ]);
    return mensajes;
  }

  // El mensaje y la actividad de la publicación, juntos.
  async crear(datos: {
    id_reclamacion: number;
    id_emisor: number;
    contenido: string;
    id_publicacion: number;
  }) {
    const { id_publicacion, ...mensaje } = datos;
    const [creado] = await this.prisma.$transaction([
      this.prisma.mensaje.create({
        data: mensaje,
        select: { id: true, contenido: true, fecha_envio: true },
      }),
      this.prisma.publicacion.update({
        where: { id: id_publicacion },
        data: { ultima_actividad: new Date() },
      }),
    ]);
    return creado;
  }
}
