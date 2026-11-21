import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoPendiente, ChipEstado, ChipTipo } from '@/components/Publicaciones';
import { enlaceChat } from '@/lib/adaptar';
import { apiGet, apiGetPendiente } from '@/lib/api/servidor';
import { ETIQUETA_RECLAMACION, folio, formatearFecha, mapaIconos } from '@/lib/formato';
import { usuarioOLogin } from '@/lib/sesion';
import type { Catalogos, MiPublicacion, MiReclamacion } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Mis publicaciones' };

export default async function MisPublicacionesPage() {
  await usuarioOLogin('/mis-publicaciones');
  const [publicaciones, reclamaciones, catalogos] = await Promise.all([
    apiGetPendiente<MiPublicacion[]>('/usuarios/me/publicaciones'),
    apiGetPendiente<MiReclamacion[]>('/usuarios/me/reclamaciones'),
    apiGet<Catalogos>('/catalogos'),
  ]);
  const iconos = mapaIconos(catalogos.categorias);

  return (
    <>
      <section className="stack">
        <div className="sec-head" style={{ margin: 0 }}>
          <h1 className="titulo-pagina">Mis publicaciones</h1>
          <Link href="/publicar" className="btn btn-primary">
            Nueva publicación
          </Link>
        </div>
        {publicaciones === undefined ? (
          <AvisoPendiente endpoint="GET /api/usuarios/me/publicaciones" que="listar tus publicaciones" />
        ) : publicaciones.length === 0 ? (
          <p className="empty">Todavía no has publicado nada.</p>
        ) : (
          <ul className="list">
            {publicaciones.map((p) => (
              <li key={p.id}>
                <Link href={`/publicaciones/${p.id}`} className="list-item">
                  <span style={{ fontSize: '1.6rem' }} aria-hidden>
                    {iconos[p.categoria] ?? '📦'}
                  </span>
                  <span className="grow">
                    <strong>{p.titulo}</strong>
                    <span className="muted small">
                      <span className="mono">{folio(p.id)}</span> · {p.sede} · {formatearFecha(p.fecha_creacion)}
                    </span>
                  </span>
                  <span className="chips">
                    <ChipTipo tipo={p.tipo} />
                    <ChipEstado estado={p.estado} />
                    {p.reclamaciones_pendientes > 0 && (
                      <span className="chip chip-alerta">{p.reclamaciones_pendientes} por revisar</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2>Mis reclamaciones</h2>
        {reclamaciones === undefined ? (
          <AvisoPendiente endpoint="GET /api/usuarios/me/reclamaciones" que="listar los objetos que reclamaste" />
        ) : reclamaciones.length === 0 ? (
          <p className="empty">No has reclamado ningún objeto.</p>
        ) : (
          <ul className="list">
            {reclamaciones.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.estado === 'ACEPTADA' ? enlaceChat(r.id, r.publicacion.id) : `/publicaciones/${r.publicacion.id}`}
                  className="list-item"
                >
                  <span className="grow">
                    <strong>{r.publicacion.titulo}</strong>
                    <span className="muted small">{formatearFecha(r.fecha)}</span>
                  </span>
                  <span className="chips">
                    <span className={`chip chip-${r.estado}`}>{ETIQUETA_RECLAMACION[r.estado]}</span>
                    {r.estado === 'ACEPTADA' && <span className="chip chip-ACTIVA">Abrir chat</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
