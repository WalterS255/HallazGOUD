import { Injectable } from '@nestjs/common';
import type { tipo_notificacion } from '../../generated/prisma/client.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';

export type TipoNotificacion = tipo_notificacion;

@Injectable()
export class NotificacionesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Para decidir si mandar correo. El correo sale de aquí y de ningún otro lado:
  // nunca llega a la respuesta de la API.
  destinatario(id_usuario: number) {
    return this.prisma.usuario.findUnique({
      where: { id: id_usuario },
      select: { nombre: true, correo: true, notificar_por_correo: true, estado_cuenta: true },
    });
  }

  async crear(datos: {
    id_usuario: number;
    tipo: TipoNotificacion;
    mensaje: string;
    id_referencia: number | null;
  }): Promise<void> {
    await this.prisma.notificacion.create({ data: datos });
  }

  // ¿Ya tiene un aviso SIN LEER igual (mismo tipo y misma referencia)? Sirve para no
  // mandar un correo por cada mensaje de un chat activo: basta con el primero.
  async hayIgualSinLeer(id_usuario: number, tipo: TipoNotificacion, id_referencia: number | null) {
    const n = await this.prisma.notificacion.count({
      where: { id_usuario, tipo, id_referencia, leida: false },
    });
    return n > 0;
  }

  async listar(id_usuario: number, soloNoLeidas: boolean, limite: number) {
    const [datos, no_leidas] = await this.prisma.$transaction([
      this.prisma.notificacion.findMany({
        where: { id_usuario, ...(soloNoLeidas ? { leida: false } : {}) },
        select: {
          id: true,
          tipo: true,
          mensaje: true,
          id_referencia: true,
          leida: true,
          fecha: true,
        },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        take: limite,
      }),
      this.prisma.notificacion.count({ where: { id_usuario, leida: false } }),
    ]);
    return { datos, no_leidas };
  }

  // `id_usuario` en el WHERE: nadie marca como leída una notificación ajena.
  // Devuelve cuántas cambió (0 = no existe o no es tuya).
  async marcarLeida(id: number, id_usuario: number): Promise<number> {
    const r = await this.prisma.notificacion.updateMany({
      where: { id, id_usuario },
      data: { leida: true },
    });
    return r.count;
  }

  async marcarTodas(id_usuario: number): Promise<number> {
    const r = await this.prisma.notificacion.updateMany({
      where: { id_usuario, leida: false },
      data: { leida: true },
    });
    return r.count;
  }
}
