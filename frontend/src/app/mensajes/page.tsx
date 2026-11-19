import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoPendiente } from '@/components/Publicaciones';
import { enlaceChat } from '@/lib/adaptar';
import { apiGetPendiente } from '@/lib/api/servidor';
import { relativo } from '@/lib/formato';
import { usuarioOLogin } from '@/lib/sesion';
import type { Conversacion } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Mensajes' };

export default async function MensajesPage() {
  await usuarioOLogin('/mensajes');
  const conversaciones = await apiGetPendiente<Conversacion[]>('/usuarios/me/conversaciones');

  return (
    <section className="stack" style={{ maxWidth: 760, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Mensajes</h1>
      {conversaciones === undefined ? (
        <>
          <AvisoPendiente endpoint="GET /api/usuarios/me/conversaciones" que="listar tus chats" />
          <p className="muted small">
            Mientras tanto, los chats se abren desde el detalle de la publicación o desde la notificación de
            &quot;reclamación aceptada&quot;.
          </p>
        </>
      ) : conversaciones.length === 0 ? (
        <p className="empty">Aún no tienes conversaciones. El chat se habilita cuando se acepta una reclamación.</p>
      ) : (
        <ul className="list">
          {conversaciones.map((c) => (
            <li key={c.id_reclamacion}>
              <Link href={enlaceChat(c.id_reclamacion, c.publicacion.id)} className="list-item">
                <span className="grow">
                  <strong>{c.publicacion.titulo}</strong>
                  <span className="muted small">
                    {c.contraparte.nombre}: {c.ultimo_mensaje?.contenido ?? 'Sin mensajes todavía'}
                  </span>
                </span>
                <span className="muted small">
                  {c.ultimo_mensaje && relativo(c.ultimo_mensaje.fecha_envio)}{' '}
                  {c.no_leidos > 0 && <span className="count">{c.no_leidos}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
