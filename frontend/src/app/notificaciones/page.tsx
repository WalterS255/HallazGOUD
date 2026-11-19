import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api/servidor';
import { enlaceNotificacion, relativo } from '@/lib/formato';
import { usuarioOLogin } from '@/lib/sesion';
import type { Notificaciones } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Notificaciones' };

export default async function NotificacionesPage() {
  await usuarioOLogin('/notificaciones');
  const { datos, no_leidas } = await apiGet<Notificaciones>('/notificaciones');
  // Al abrir la página se dan por vistas (el resaltado usa el estado previo).
  if (no_leidas > 0) await apiPost('/notificaciones/leer-todas');

  return (
    <section className="stack" style={{ maxWidth: 760, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Notificaciones</h1>
      {datos.length === 0 ? (
        <p className="empty">No tienes notificaciones.</p>
      ) : (
        <ul className="list">
          {datos.map((n) => (
            <li key={n.id} className={n.leida ? '' : 'unread'}>
              <Link href={enlaceNotificacion(n)} className="list-item">
                <span className="grow">
                  <span style={n.leida ? undefined : { fontWeight: 700 }}>
                    {!n.leida && <span className="sr-only">Nueva: </span>}
                    {n.mensaje}
                  </span>
                  <span className="muted small">{relativo(n.fecha)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Si lo activas en tu perfil, también te llegan por correo.</p>
    </section>
  );
}
