import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { apiGetOpcional } from './api/servidor';
import type { Perfil, Rol } from './tipos';

/** Usuario actual (GET /usuarios/me). Null si no hay sesión o el token venció. Una consulta por petición. */
export const obtenerUsuario = cache(() => apiGetOpcional<Perfil>('/usuarios/me'));

/** Para páginas privadas: devuelve el usuario o redirige al login conservando la ruta de regreso. */
export async function usuarioOLogin(rutaActual: string): Promise<Perfil> {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect(`/login?siguiente=${encodeURIComponent(rutaActual)}`);
  return usuario;
}

/**
 * ¿Puede ver /estado? Solo un ADMIN: el diagnóstico muestra la configuración del servidor.
 * Excepción: en desarrollo, con el backend caído (no se puede saber quién es), se deja ver
 * porque es justo cuando sirve.
 */
export async function puedeVerEstado(): Promise<boolean> {
  try {
    return (await obtenerUsuario())?.rol === 'ADMIN';
  } catch {
    return process.env.NODE_ENV === 'development';
  }
}

export function esModerador(rol: Rol) {
  return rol === 'MODERADOR' || rol === 'ADMIN';
}
