import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { Tx } from '../publicaciones/publicaciones.repository.js';

export type AccionCuenta = 'SUSPENDER' | 'REACTIVAR';

// Lo que ve el admin de una cuenta. SIN correo (RF-22): se puede BUSCAR por correo,
// pero la respuesta no lo devuelve.
const SELECT_ADMIN = {
  id: true,
  nombre: true,
  programa: true,
  rol: true,
  estado_cuenta: true,
  verificado: true,
  fecha_registro: true,
} as const;

@Injectable()
export class UsuariosAdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  buscar(q: string) {
    return this.prisma.usuario.findMany({
      where: {
        OR: [
          { nombre: { contains: q, mode: 'insensitive' } },
          // Correo exacto (ya en minúsculas): sirve para encontrar a alguien sin
          // permitir "pescar" correos con búsquedas parciales.
          { correo: q.toLowerCase() },
        ],
      },
      select: SELECT_ADMIN,
      orderBy: { id: 'asc' },
      take: 20,
    });
  }

  enTransaccion<T>(trabajo: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(trabajo);
  }

  // FOR UPDATE: dos admins actuando sobre la misma cuenta a la vez no se pisan.
  async bloquear(tx: Tx, id: number) {
    const filas = await tx.$queryRaw<
      { id: number; estado_cuenta: string; nombre: string | null }[]
    >`
      SELECT id, estado_cuenta::text AS estado_cuenta, nombre FROM usuario WHERE id = ${id} FOR UPDATE`;
    return filas[0] ?? null;
  }

  async guardarEstado(tx: Tx, id: number, estado: 'ACTIVA' | 'SUSPENDIDA') {
    return tx.usuario.update({
      where: { id },
      data: { estado_cuenta: estado },
      select: SELECT_ADMIN,
    });
  }
}

@Injectable()
export class UsuariosAdminService {
  constructor(
    private readonly repo: UsuariosAdminRepository,
    private readonly auditoria: AuditoriaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  buscar(q: string) {
    return this.repo.buscar(q.trim());
  }

  // RF-29. Limitación conocida (RNF-15, sin estado): el JWT que la persona ya tenía
  // sigue sirviendo hasta que vence; lo que se bloquea de inmediato es el próximo login.
  async cambiarEstado(
    id: number,
    accion: AccionCuenta,
    id_admin: number,
    motivo: string | undefined,
    ip?: string | null,
  ) {
    if (id === id_admin) {
      throw new ErrorApp(
        HttpStatus.CONFLICT,
        'ACCION_SOBRE_SI_MISMO',
        'No puedes suspender ni reactivar tu propia cuenta.',
      );
    }
    const nuevo = accion === 'SUSPENDER' ? 'SUSPENDIDA' : 'ACTIVA';
    const usuario = await this.repo.enTransaccion(async (tx) => {
      const u = await this.repo.bloquear(tx, id);
      if (!u) {
        throw new ErrorApp(HttpStatus.NOT_FOUND, 'USUARIO_NO_ENCONTRADO', 'La cuenta no existe.');
      }
      if (u.estado_cuenta === 'ELIMINADA') {
        // Anonimizada (Ley 1581): ya no se puede reactivar ni suspender.
        throw new ErrorApp(HttpStatus.CONFLICT, 'CUENTA_ELIMINADA', 'Esta cuenta fue eliminada.');
      }
      if (u.estado_cuenta === nuevo) {
        throw new ErrorApp(
          HttpStatus.CONFLICT,
          'SIN_CAMBIO',
          nuevo === 'SUSPENDIDA' ? 'La cuenta ya está suspendida.' : 'La cuenta ya está activa.',
        );
      }
      const actualizado = await this.repo.guardarEstado(tx, id, nuevo);
      await this.auditoria.registrar(
        {
          accion: accion === 'SUSPENDER' ? 'CUENTA_SUSPENDIDA' : 'CUENTA_REACTIVADA',
          entidad: 'usuario',
          id_entidad: id,
          id_usuario: id_admin,
          detalle: { motivo: motivo ?? null },
          ip,
        },
        tx,
      );
      return actualizado;
    });

    // Aviso en la app. El correo solo sale al REACTIVAR: a una cuenta suspendida
    // `avisar` no le escribe (solo a cuentas ACTIVAS).
    await this.notificaciones.avisar({
      id_usuario: id,
      tipo: 'ESTADO',
      mensaje:
        accion === 'SUSPENDER'
          ? `Tu cuenta fue suspendida${motivo ? `: ${motivo}` : '.'}`
          : 'Tu cuenta fue reactivada. Ya puedes volver a iniciar sesión.',
      ruta: '/perfil',
    });
    return usuario;
  }
}
