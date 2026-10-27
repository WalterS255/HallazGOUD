import { Injectable } from '@nestjs/common';
import type { ClienteBd } from '../../lib/auditoria/auditoria.service.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';
import type { EstadoIntentos } from './bloqueo.js';
import type { TipoToken, TokenNuevo } from './tokens.js';

// Acceso a la BD del módulo de auth. Sin reglas de negocio (esas van en auth.service).
// Regla 6.3: SIEMPRE con lista explícita de columnas sobre `usuario`. El hash de la
// contraseña solo sale de aquí en `buscarParaLogin`, y solo hacia el servicio de auth.

export interface CuentaLogin {
  id: number;
  nombre: string | null;
  rol: 'USUARIO' | 'MODERADOR' | 'ADMIN';
  verificado: boolean;
  estado_cuenta: 'ACTIVA' | 'SUSPENDIDA' | 'ELIMINADA';
  hash_contrasena: string | null;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
}

export interface TokenEncontrado {
  id: number;
  id_usuario: number;
  tipo: TipoToken;
  expira_en: Date;
  usado_en: Date | null;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Busca por correo SIN distinguir mayúsculas. Se usa SQL a mano porque el índice
  // único es sobre lower(correo): un `where: { correo }` de Prisma compararía la
  // columna tal cual y PostgreSQL no podría usar ese índice. Los parámetros van con
  // ${} dentro de $queryRaw``: Prisma los envía aparte, así que NO hay inyección SQL.
  async buscarParaLogin(correo: string): Promise<CuentaLogin | null> {
    const filas = await this.prisma.$queryRaw<CuentaLogin[]>`
      SELECT id, nombre, rol::text AS rol, verificado, estado_cuenta::text AS estado_cuenta,
             hash_contrasena, intentos_fallidos, bloqueado_hasta
      FROM usuario
      WHERE lower(correo) = lower(${correo})
      LIMIT 1`;
    return filas[0] ?? null;
  }

  async crearUsuario(
    datos: {
      nombre: string;
      correo: string;
      programa: string;
      hash_contrasena: string;
      acepto_politica_en: Date;
    },
    bd: ClienteBd = this.prisma,
  ): Promise<{ id: number }> {
    return bd.usuario.create({ data: datos, select: { id: true } });
  }

  async guardarToken(
    id_usuario: number,
    tipo: TipoToken,
    t: TokenNuevo,
    bd: ClienteBd = this.prisma,
  ): Promise<void> {
    await bd.token_usuario.create({
      data: {
        id_usuario,
        tipo,
        token_hash: t.tokenHash,
        // Las dos fechas desde Node (mismo reloj): ver el comentario en tokens.ts.
        creado_en: t.creadoEn,
        expira_en: t.expiraEn,
      },
    });
  }

  async buscarToken(token_hash: string): Promise<TokenEncontrado | null> {
    return this.prisma.token_usuario.findUnique({
      where: { token_hash },
      select: { id: true, id_usuario: true, tipo: true, expira_en: true, usado_en: true },
    });
  }

  // Marca el token como usado SOLO si nadie lo usó antes. Si dos peticiones llegan a
  // la vez con el mismo enlace, PostgreSQL deja pasar solo una (la otra actualiza 0
  // filas): así un token nunca sirve dos veces.
  async marcarTokenUsado(id: number, ahora: Date, bd: ClienteBd): Promise<boolean> {
    const r = await bd.token_usuario.updateMany({
      where: { id, usado_en: null },
      data: { usado_en: ahora },
    });
    return r.count === 1;
  }

  // Al restablecer la contraseña, los demás enlaces de recuperación pendientes dejan de servir.
  async invalidarTokens(id_usuario: number, tipo: TipoToken, ahora: Date, bd: ClienteBd) {
    await bd.token_usuario.updateMany({
      where: { id_usuario, tipo, usado_en: null },
      data: { usado_en: ahora },
    });
  }

  async marcarVerificado(id: number, bd: ClienteBd): Promise<void> {
    await bd.usuario.update({ where: { id }, data: { verificado: true }, select: { id: true } });
  }

  async guardarIntentos(id: number, e: EstadoIntentos, bd: ClienteBd = this.prisma) {
    await bd.usuario.update({
      where: { id },
      data: { intentos_fallidos: e.intentosFallidos, bloqueado_hasta: e.bloqueadoHasta },
      select: { id: true },
    });
  }

  async cambiarContrasena(id: number, hash_contrasena: string, bd: ClienteBd): Promise<void> {
    await bd.usuario.update({
      where: { id },
      // Contraseña nueva = borrón y cuenta nueva: se quita cualquier bloqueo.
      data: { hash_contrasena, intentos_fallidos: 0, bloqueado_hasta: null },
      select: { id: true },
    });
  }

  // Lo que el propio usuario ve de sí mismo en /api/usuarios/me (sin hash ni tokens).
  async perfil(id: number) {
    return this.prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        correo: true,
        programa: true,
        foto_url: true,
        rol: true,
        notificar_por_correo: true,
        fecha_registro: true,
      },
    });
  }

  async actualizarPerfil(
    id: number,
    datos: { nombre?: string; programa?: string; notificar_por_correo?: boolean },
  ): Promise<void> {
    await this.prisma.usuario.update({ where: { id }, data: datos, select: { id: true } });
  }

  async fotoDe(id: number): Promise<string | null> {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: { foto_url: true } });
    return u?.foto_url ?? null;
  }

  async guardarFoto(id: number, foto_url: string | null): Promise<void> {
    await this.prisma.usuario.update({ where: { id }, data: { foto_url }, select: { id: true } });
  }

  // ¿Cuándo se envió el último enlace de este tipo? (para no reenviar sin parar)
  async ultimoToken(id_usuario: number, tipo: TipoToken): Promise<Date | null> {
    const t = await this.prisma.token_usuario.findFirst({
      where: { id_usuario, tipo },
      orderBy: { creado_en: 'desc' },
      select: { creado_en: true },
    });
    return t?.creado_en ?? null;
  }

  // Para servir la foto: solo de cuentas que no estén eliminadas (anonimizadas).
  async cuentaVisible(id: number): Promise<boolean> {
    const u = await this.prisma.usuario.findUnique({
      where: { id },
      select: { estado_cuenta: true },
    });
    return u !== null && u.estado_cuenta !== 'ELIMINADA';
  }

  transaccion<T>(fn: (tx: ClienteBd) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }
}
