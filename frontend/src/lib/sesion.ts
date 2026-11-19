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

export function esModerador(rol: Rol) {
  return rol === 'MODERADOR' || rol === 'ADMIN';
}
