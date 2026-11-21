import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Acciones críticas que se auditan (RNF-18). Una lista cerrada evita que cada
// módulo invente nombres distintos para lo mismo ("LOGIN_FALLO" vs "LOGIN_FALLIDO").
export type AccionAuditada =
  | 'PUBLICACION_CREADA'
  | 'PUBLICACION_EDITADA'
  | 'PUBLICACION_CAMBIO_ESTADO'
  | 'RECLAMACION_ACEPTADA'
  | 'RECLAMACION_RECHAZADA'
  | 'RECLAMACION_CANCELADA'
  | 'ENTREGA_CONFIRMADA'
  | 'LOGIN_FALLIDO'
  | 'CUENTA_REGISTRADA'
  | 'CUENTA_VERIFICADA'
  | 'CONTRASENA_RESTABLECIDA'
  | 'CUENTA_BLOQUEADA'
  | 'CUENTA_SUSPENDIDA'
  | 'CUENTA_REACTIVADA'
  | 'CUENTA_ANONIMIZADA'
  | 'MODERACION_OCULTAR'
  | 'MODERACION_RESOLVER';

export interface EventoAuditoria {
  accion: AccionAuditada;
  entidad: string; // tabla afectada: 'publicacion', 'usuario'…
  id_entidad?: number;
  id_usuario?: number | null; // quién lo hizo; null = el sistema (cron) o un visitante
  detalle?: Prisma.InputJsonObject;
  ip?: string | null;
}

// Cliente de BD: el normal o el de una transacción (`tx` dentro de prisma.$transaction).
export type ClienteBd = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  // Pasa el `tx` de tu transacción: así, si algo falla después, también se deshace
  // el registro de auditoría (y viceversa: si la auditoría falla, no se guarda el cambio).
  // Nunca guardes aquí contraseñas, tokens ni el detalle reservado.
  async registrar(evento: EventoAuditoria, bd: ClienteBd = this.prisma): Promise<void> {
    await bd.auditoria.create({
      data: {
        accion: evento.accion,
        entidad: evento.entidad,
        id_entidad: evento.id_entidad ?? null,
        id_usuario: evento.id_usuario ?? null,
        detalle: evento.detalle ?? {},
        ip: evento.ip ?? null,
      },
    });
  }
}
