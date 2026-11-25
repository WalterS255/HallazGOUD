import Link from 'next/link';
import { apiGetOpcional } from '@/lib/api/servidor';
import { primerNombre } from '@/lib/formato';
import { esModerador, obtenerUsuario } from '@/lib/sesion';
import type { Notificaciones, Perfil } from '@/lib/tipos';
import { EnlaceNav } from './EnlaceNav';
import { BotonTema } from './BotonTema';

export async function Encabezado() {
  let usuario: Perfil | null = null;
  let noLeidas = 0;
  let sinBackend = false;
  try {
    usuario = await obtenerUsuario();
    if (usuario)
      noLeidas =
        (await apiGetOpcional<Notificaciones>('/notificaciones?no_leidas=true'))?.no_leidas ?? 0;
  } catch {
    sinBackend = true; // el encabezado nunca debe tumbar la página
  }

  return (
    <header className="top">
      {sinBackend && (
        <p className="aviso-conexion" role="alert">
          Sin conexión con el backend.{' '}
          {/* El diagnóstico solo se abre así en desarrollo (ver puedeVerEstado). */}
          {process.env.NODE_ENV === 'development' && (
            <Link href="/estado" className="underline">
              Ver diagnóstico
            </Link>
          )}
        </p>
      )}
      <div className="wrap">
        <Link href="/" className="logo" aria-label="HallazGO UD, inicio">
          HallazGO <b>UD</b>
        </Link>
        <nav className="nav" aria-label="Principal">
          <EnlaceNav href="/publicaciones">Catálogo</EnlaceNav>
          <EnlaceNav href="/publicar">Publicar</EnlaceNav>
          {usuario ? (
            <>
              <EnlaceNav href="/mis-publicaciones">Mis publicaciones</EnlaceNav>
              <EnlaceNav href="/mensajes">Mensajes</EnlaceNav>
              <EnlaceNav href="/notificaciones">
                Notificaciones
                {noLeidas > 0 && (
                  <span className="count">
                    {noLeidas}
                    <span className="sr-only"> sin leer</span>
                  </span>
                )}
              </EnlaceNav>
              {esModerador(usuario.rol) && <EnlaceNav href="/admin">Administración</EnlaceNav>}
              <EnlaceNav href="/perfil">{primerNombre(usuario.nombre)}</EnlaceNav>
              <form action="/api/auth/logout" method="post">
                <button type="submit">Salir</button>
              </form>
            </>
          ) : (
            <>
              <EnlaceNav href="/login">Entrar</EnlaceNav>
              <Link href="/registro" className="btn btn-primary" style={{ padding: '6px 12px' }}>
                Crear cuenta
              </Link>
            </>
          )}
          <BotonTema />
        </nav>
      </div>
    </header>
  );
}
