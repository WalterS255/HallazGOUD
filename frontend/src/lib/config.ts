// Configuración de conexión al backend (sólo se lee en el servidor de Next.js).

export const config = {
  backendUrl: (process.env.BACKEND_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  apiPrefix: (process.env.BACKEND_API_PREFIX ?? '/api').replace(/\/$/, ''),
  dominio: process.env.DOMINIO_CORREO ?? 'udistrital.edu.co',
} as const;

/** Cookie httpOnly donde el frontend guarda el JWT del backend. El código del navegador nunca lo ve. */
export const COOKIE_TOKEN = 'hg_token';
/** Igual a JWT_EXPIRA_EN del backend (1 día por defecto). */
export const DURACION_TOKEN_S = 60 * 60 * 24;

export function urlBackend(ruta: string) {
  return `${config.backendUrl}${config.apiPrefix}${ruta}`;
}
