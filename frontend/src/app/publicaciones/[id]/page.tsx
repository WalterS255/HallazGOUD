import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Galeria } from '@/components/Galeria';
import { ChipEstado, ChipTipo, GrillaPublicaciones } from '@/components/Publicaciones';
import { AccionesAutor } from '@/components/publicacion/AccionesAutor';
import { BotonReportar } from '@/components/publicacion/BotonReportar';
import { FormReclamar } from '@/components/publicacion/FormReclamar';
import { PanelReclamaciones } from '@/components/publicacion/PanelReclamaciones';
import { aResumen, enlaceChat } from '@/lib/adaptar';
import { apiGet, apiGetOpcional, apiGetPendiente, ErrorBackend } from '@/lib/api/servidor';
import {
  ETIQUETA_RECLAMACION,
  folio,
  formatearFecha,
  formatearFechaHora,
  iconoCategoria,
  mapaIconos,
  textoLugar,
} from '@/lib/formato';
import { obtenerUsuario } from '@/lib/sesion';
import type {
  Catalogos,
  Coincidencia,
  MiReclamacion,
  Publicacion,
  ReclamacionesDePublicacion,
  ResumenPublicacion,
} from '@/lib/tipos';

type Props = { params: Promise<{ id: string }> };

const cargar = cache(async (id: string) => {
  try {
    return await apiGet<Publicacion>(`/publicaciones/${encodeURIComponent(id)}`);
  } catch (e) {
    // 404: no existe u oculta por moderación. 400: el id no es un número.
    if (e instanceof ErrorBackend && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await cargar((await params).id)).titulo };
}

/** RF-23: el backend devuelve ids y puntajes; cada sugerencia se completa con su ficha. */
async function sugerencias(id: number): Promise<(ResumenPublicacion & { puntaje: number })[]> {
  const lista = (await apiGet<Coincidencia[]>(`/publicaciones/${id}/coincidencias`)).slice(0, 8);
  const fichas = await Promise.all(
    lista.map((c) => apiGetOpcional<Publicacion>(`/publicaciones/${c.id_publicacion}`)),
  );
  return fichas.flatMap((f, i) => (f ? [{ ...aResumen(f), puntaje: lista[i].puntaje.total }] : []));
}

export default async function DetallePublicacionPage({ params }: Props) {
  const { id } = await params;
  const [p, usuario, catalogos] = await Promise.all([
    cargar(id),
    obtenerUsuario(),
    apiGet<Catalogos>('/catalogos'),
  ]);
  const esAutor = !!usuario && usuario.id === p.usuario.id;
  const abierta = p.estado === 'ACTIVA' || p.estado === 'EN_RECLAMACION';
  const icono = iconoCategoria(catalogos.categorias.find((c) => c.id === p.categoria.id)?.icono);

  const [reclamaciones, coincidencias, misReclamaciones] = await Promise.all([
    esAutor && p.tipo === 'ENCONTRADO'
      ? apiGet<ReclamacionesDePublicacion>(`/publicaciones/${p.id}/reclamaciones`)
      : null,
    esAutor && abierta ? sugerencias(p.id) : [],
    usuario && !esAutor && p.tipo === 'ENCONTRADO'
      ? apiGetPendiente<MiReclamacion[]>('/usuarios/me/reclamaciones')
      : undefined,
  ]);
  const miReclamacion = misReclamaciones?.find((r) => r.publicacion.id === p.id);

  return (
    <>
      <Link href="/publicaciones" className="link" style={{ justifySelf: 'start' }}>
        ← Volver al catálogo
      </Link>

      <div className="detail">
        <Galeria imagenes={p.imagenes} titulo={p.titulo} icono={icono} />

        <div className="stack">
          <div className="chips">
            <ChipTipo tipo={p.tipo} />
            <ChipEstado estado={p.estado} />
            <span className="chip chip-folio">{folio(p.id)}</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)' }}>{p.titulo}</h1>
          <dl className="facts">
            <dt>Categoría</dt>
            <dd>
              {icono} {p.categoria.nombre}
            </dd>
            <dt>Lugar</dt>
            <dd>
              {p.lugar.sede.nombre} · {p.ubicacion ?? textoLugar(p.lugar)}
            </dd>
            {p.pista && (
              <>
                <dt>Pista para reclamar</dt>
                <dd>{p.pista}</dd>
              </>
            )}
            <dt>{p.tipo === 'ENCONTRADO' ? 'Encontrado' : 'Perdido'}</dt>
            <dd>{formatearFechaHora(p.fecha_suceso)}</dd>
            <dt>Publicado por</dt>
            <dd>
              {p.usuario.nombre} · {formatearFecha(p.fecha_creacion)}
            </dd>
          </dl>
          <p style={{ whiteSpace: 'pre-line' }}>{p.descripcion}</p>

          {p.categoria.sensible && p.tipo === 'ENCONTRADO' && (
            <p className="note note-info">
              Objeto sensible: se recomienda hacer la entrega en la oficina de seguridad de la
              facultad.
            </p>
          )}

          {/* Acciones según quién mira (RF-17) */}
          {!usuario && p.estado === 'ACTIVA' && (
            <div className="panel small">
              Para {p.tipo === 'ENCONTRADO' ? 'reclamar este objeto' : 'ayudar'} necesitas{' '}
              <Link href={`/login?siguiente=/publicaciones/${p.id}`} className="link">
                ingresar con tu correo institucional
              </Link>
              .
            </div>
          )}

          {usuario &&
            !esAutor &&
            p.tipo === 'ENCONTRADO' &&
            (miReclamacion ? (
              <div className="panel stack">
                <p>
                  Tu reclamación está{' '}
                  <span className={`chip chip-${miReclamacion.estado}`}>
                    {ETIQUETA_RECLAMACION[miReclamacion.estado]}
                  </span>
                </p>
                {miReclamacion.estado === 'ACEPTADA' && (
                  <Link href={enlaceChat(miReclamacion.id, p.id)} className="btn btn-primary">
                    Ir al chat de entrega
                  </Link>
                )}
              </div>
            ) : (
              p.estado === 'ACTIVA' && (
                <FormReclamar publicacionId={p.id} autor={p.usuario.nombre} pista={p.pista} />
              )
            ))}

          {/* "¡Lo tengo!" (pregunta 13.1): abre el asistente de hallazgo ya prellenado. */}
          {usuario && !esAutor && p.tipo === 'PERDIDO' && p.estado === 'ACTIVA' && (
            <div className="panel stack">
              <p className="small">
                ¿Tienes este objeto? Publica el hallazgo y le avisaremos a {p.usuario.nombre}.
              </p>
              <Link href={`/publicar?lo_tengo=${p.id}`} className="btn btn-primary">
                ¡Lo tengo!
              </Link>
            </div>
          )}

          {usuario && !esAutor && <BotonReportar publicacionId={p.id} />}
        </div>
      </div>

      {esAutor && (
        <>
          <AccionesAutor publicacionId={p.id} imagenes={p.imagenes} editable={abierta} />
          {reclamaciones && (
            <PanelReclamaciones publicacionId={p.id} datos={reclamaciones} pista={p.pista} />
          )}
          {abierta && (
            <section>
              <div className="sec-head">
                <h2>Posibles coincidencias</h2>
                <span className="muted small">
                  Categoría 35 · sede 20 · fecha ±7 días 25 · texto 20
                </span>
              </div>
              <GrillaPublicaciones
                items={coincidencias}
                iconos={mapaIconos(catalogos.categorias)}
                vacio="Aún no hay publicaciones parecidas. Te avisaremos cuando aparezca alguna."
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
