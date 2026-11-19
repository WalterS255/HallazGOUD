import type { Metadata } from 'next';
import Link from 'next/link';
import { Chat } from '@/components/Chat';
import { apiGet, apiGetOpcional, ErrorBackend } from '@/lib/api/servidor';
import { unico, type ParamsBusqueda } from '@/lib/params';
import { usuarioOLogin } from '@/lib/sesion';
import type { Mensaje, Publicacion, ReclamacionesDePublicacion } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Conversación' };

const MENSAJES: Record<string, string> = {
  SIN_CHAT: 'El chat se habilita cuando quien encontró el objeto acepta la reclamación.',
  PROHIBIDO: 'No participas en esta conversación.',
};

type Props = { params: Promise<{ id: string }>; searchParams: ParamsBusqueda };

export default async function ConversacionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const idPublicacion = unico((await searchParams).publicacion);
  const yo = await usuarioOLogin(`/mensajes/${id}`);

  const mensajes = await apiGet<Mensaje[]>(`/reclamaciones/${encodeURIComponent(id)}/mensajes`).catch((e: unknown) => {
    if (e instanceof ErrorBackend && e.status < 500) return e;
    throw e;
  });
  if (mensajes instanceof ErrorBackend) {
    return (
      <div className="stack" style={{ maxWidth: 760, width: '100%', marginInline: 'auto' }}>
        <p className="note note-err">{MENSAJES[mensajes.codigo] ?? mensajes.message}</p>
        <Link href="/mensajes" className="link">
          ← Volver a mensajes
        </Link>
      </div>
    );
  }

  // El backend no tiene GET /reclamaciones/:id: el contexto se arma con la publicación (si viene en el enlace).
  const p = idPublicacion ? await apiGetOpcional<Publicacion>(`/publicaciones/${encodeURIComponent(idPublicacion)}`) : null;
  const esAutor = !!p && p.usuario.id === yo.id;
  let contraparte = mensajes.find((m) => m.emisor.id !== yo.id)?.emisor.nombre;
  if (!contraparte && p && !esAutor) contraparte = p.usuario.nombre;
  if (!contraparte && p && esAutor) {
    const r = await apiGetOpcional<ReclamacionesDePublicacion>(`/publicaciones/${p.id}/reclamaciones`);
    contraparte = r?.reclamaciones.find((x) => String(x.id) === id)?.reclamante.nombre;
  }
  contraparte ??= 'la otra persona';

  return (
    <>
      <Link href="/mensajes" className="link" style={{ justifySelf: 'start' }}>
        ← Mensajes
      </Link>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="titulo-pagina">Chat con {contraparte}</h1>
        <p className="muted">
          {p ? (
            <>
              Sobre{' '}
              <Link href={`/publicaciones/${p.id}`} className="link">
                {p.titulo}
              </Link>
              .{' '}
            </>
          ) : null}
          Tu correo y teléfono nunca se muestran a la otra persona.
        </p>
      </div>
      <Chat
        reclamacionId={Number(id)}
        miId={yo.id}
        contraparte={contraparte}
        mensajesIniciales={mensajes}
        entregada={p?.estado === 'ENTREGADA'}
      />
    </>
  );
}
