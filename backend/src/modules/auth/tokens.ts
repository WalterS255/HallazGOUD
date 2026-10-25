// Tokens de un solo uso para los enlaces de verificación y de recuperación (regla 6.7).
//
// Cómo funcionan:
//   1. Se genera un token aleatorio y se ENVÍA por correo dentro del enlace.
//   2. En la BD (token_usuario.token_hash) se guarda solo su HASH SHA-256, nunca el token.
//   3. Cuando el usuario abre el enlace, se calcula el hash de lo que trae y se busca.
// Así, si alguien roba una copia de la base de datos, no puede usar ningún enlace:
// del hash no se puede volver al token.
//
// ¿Por qué SHA-256 y no bcrypt, como las contraseñas? bcrypt es lento A PROPÓSITO
// para que adivinar una contraseña corta cueste mucho. Un token de 32 bytes
// aleatorios ya es imposible de adivinar, así que basta un hash rápido.
import { createHash, randomBytes } from 'node:crypto';

export type TipoToken = 'VERIFICACION' | 'RECUPERACION';

const HORA = 60 * 60 * 1000;
export const VIGENCIA: Record<TipoToken, number> = {
  VERIFICACION: 24 * HORA,
  RECUPERACION: 1 * HORA,
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface TokenNuevo {
  token: string; // va en el enlace del correo; NUNCA se guarda
  tokenHash: string; // va a la BD
  // creadoEn y expiraEn se guardan LOS DOS desde aquí, con el mismo reloj (el de Node).
  // Si creado_en lo pusiera el DEFAULT now() de Postgres, el reloj del contenedor puede
  // ir unos cientos de ms distinto y el CHECK (expira_en > creado_en) fallaría a veces.
  creadoEn: Date;
  expiraEn: Date;
}

export function generarToken(tipo: TipoToken, ahora: Date = new Date()): TokenNuevo {
  // 32 bytes del generador seguro del sistema operativo = 64 caracteres hexadecimales.
  // (Math.random() NO sirve para esto: sus valores se pueden predecir.)
  const token = randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashToken(token),
    creadoEn: ahora,
    expiraEn: new Date(ahora.getTime() + VIGENCIA[tipo]),
  };
}

// Lo mínimo que hace falta saber de un token guardado para decidir si sirve.
export interface TokenGuardado {
  expiraEn: Date;
  usadoEn: Date | null;
}

export type EstadoToken = 'VALIDO' | 'USADO' | 'EXPIRADO';

export function evaluarToken(t: TokenGuardado, ahora: Date = new Date()): EstadoToken {
  if (t.usadoEn) return 'USADO';
  if (t.expiraEn.getTime() <= ahora.getTime()) return 'EXPIRADO';
  return 'VALIDO';
}
