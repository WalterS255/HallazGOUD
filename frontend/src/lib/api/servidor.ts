import 'server-only';
import { cookies, headers } from 'next/headers';
import { config, COOKIE_TOKEN, urlBackend } from '../config';
import type { CuerpoError } from '../tipos';

// Llamadas al backend desde los componentes de servidor (páginas), con el token del usuario.

export class ErrorBackend extends Error {
  constructor(
    public status: number,
    public codigo: string,
    message: string,
  ) {
    super(message);
  }
}

export async function cabecerasDeSesion(): Promise<Headers> {
  const h = new Headers({ Accept: 'application/json' });
  const token = (await cookies()).get(COOKIE_TOKEN)?.value;
  if (token) h.set('Authorization', `Bearer ${token}`);
  // Para que el límite de peticiones del backend cuente por persona y no por servidor (requiere trust proxy).
  const ip = (await headers()).get('x-forwarded-for');
  if (ip) h.set('X-Forwarded-For', ip);
  return h;
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const h = await cabecerasDeSesion();
  if (cuerpo !== undefined) h.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(urlBackend(ruta), {
      method: metodo,
      headers: h,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ErrorBackend(
      502,
      'SIN_CONEXION',
      `No se pudo conectar con el backend en ${config.backendUrl}. Revisa que esté encendido y BACKEND_URL en frontend/.env.`,
    );
  }

  if (res.status === 204) return undefined as T;
  const datos = (await res.json().catch(() => null)) as (T & Partial<CuerpoError>) | null;
  if (!res.ok) {
    throw new ErrorBackend(
      res.status,
      datos?.error?.codigo ?? 'DESCONOCIDO',
      datos?.error?.mensaje ?? `El backend respondió ${res.status} en ${metodo} ${ruta}`,
    );
  }
  return datos as T;
}

export const apiGet = <T>(ruta: string) => pedir<T>('GET', ruta);
export const apiPost = <T>(ruta: string, cuerpo?: unknown) => pedir<T>('POST', ruta, cuerpo);

/**
 * Igual que apiGet, pero devuelve null cuando no hay sesión, no hay permiso, no existe,
 * o el identificador es inválido (el backend responde 400 a "/publicaciones/abc").
 */
export async function apiGetOpcional<T>(ruta: string): Promise<T | null> {
  try {
    return await apiGet<T>(ruta);
  } catch (e) {
    if (e instanceof ErrorBackend && [400, 401, 403, 404].includes(e.status)) return null;
    throw e;
  }
}

/** Para endpoints que el backend todavía no tiene: undefined = no existe (404 de ruta), null = sin permiso. */
export async function apiGetPendiente<T>(ruta: string): Promise<T | undefined> {
  try {
    return await apiGet<T>(ruta);
  } catch (e) {
    if (e instanceof ErrorBackend && e.status === 404) return undefined;
    throw e;
  }
}
