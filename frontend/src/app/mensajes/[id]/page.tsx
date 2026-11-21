import type { Metadata } from 'next';
import Link from 'next/link';
import { Chat } from '@/components/Chat';
import { apiGet, ErrorBackend } from '@/lib/api/servidor';
import { estadoEntrega } from '@/lib/entrega';
import { usuarioOLogin } from '@/lib/sesion';
import type { Mensaje, ReclamacionDetalle } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Conversación' };

const MENSAJES: Record<string, string> = {
  SIN_CHAT: 'El chat se habilita cuando quien encontró el objeto acepta la reclamación.',
  PROHIBIDO: 'No participas en esta conversación.',
};

type Props = { params: Promise<{ id: string }> };

// Un error 4xx del backend se muestra en la página; uno 5xx sigue a error.tsx.
const comoError = (e: unknown) => {
  if (e instanceof ErrorBackend && e.status < 500) return e;
  throw e;
};

export default async function ConversacionPage({ params }: Props) {
  const { id } = await params;
  await usuarioOLogin(`/mensajes/${id}`);
  const ruta = `/reclamaciones/${encodeURIComponent(id)}`;

  // La ficha (GET /reclamaciones/:id) dice quién es quién y en qué va la entrega,
  // así que ya no hace falta adivinarlo con la publicación del enlace.
  const [ficha, mensajes] = await Promise.all([
    apiGet<ReclamacionDetalle>(ruta).catch(comoError),
    apiGet<Mensaje[]>(`${ruta}/mensajes`).catch(comoError),
  ]);
  if (ficha instanceof ErrorBackend || mensajes instanceof ErrorBackend) {
    const fallo = ficha instanceof ErrorBackend ? ficha : (mensajes as ErrorBackend);
    return (
      <div className="stack" style={{ maxWidth: 760, width: '100%', marginInline: 'auto' }}>
        <p className="note note-err">{MENSAJES[fallo.codigo] ?? fallo.message}</p>
        <Link href="/mensajes" className="link">
          ← Volver a mensajes
        </Link>
      </div>
    );
  }

  const contraparte = (ficha.soy === 'AUTOR' ? ficha.reclamante : ficha.autor).nombre ?? 'la otra persona';

  return (
    <>
      <Link href="/mensajes" className="link" style={{ justifySelf: 'start' }}>
        ← Mensajes
      </Link>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="titulo-pagina">Chat con {contraparte}</h1>
        <p className="muted">
          Sobre{' '}
          <Link href={`/publicaciones/${ficha.publicacion.id}`} className="link">
            {ficha.publicacion.titulo}
          </Link>
          . Tu correo y teléfono nunca se muestran a la otra persona.
        </p>
      </div>
      <Chat
        reclamacionId={ficha.id}
        miId={ficha.soy === 'AUTOR' ? ficha.autor.id : ficha.reclamante.id}
        contraparte={contraparte}
        mensajesIniciales={mensajes}
        entregaInicial={estadoEntrega(ficha)}
      />
    </>
  );
}
