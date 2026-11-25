import Link from 'next/link';
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, folio, formatearFecha, relativo } from '@/lib/formato';
import type { EstadoPublicacion, ResumenPublicacion, TipoPublicacion } from '@/lib/tipos';

export function ChipTipo({ tipo }: { tipo: TipoPublicacion }) {
  return <span className={`chip chip-${tipo}`}>{ETIQUETA_TIPO[tipo]}</span>;
}

export function ChipEstado({ estado }: { estado: EstadoPublicacion }) {
  return <span className={`chip chip-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

/** Tarjeta del catálogo. `icono` es el emoji de la categoría (se muestra si no hay foto). */
export function TarjetaPublicacion({
  p,
  icono,
  puntaje,
}: {
  p: ResumenPublicacion;
  icono: string;
  puntaje?: number;
}) {
  return (
    <Link href={`/publicaciones/${p.id}`} className="pub">
      <span className="pub-media">
        {p.miniatura ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.miniatura} alt="" loading="lazy" />
        ) : (
          <span className="pub-icon" aria-hidden>
            {icono}
          </span>
        )}
        <span className="folio">{folio(p.id)}</span>
      </span>
      <span className="pub-body">
        <span className="chips">
          <ChipTipo tipo={p.tipo} />
          <ChipEstado estado={p.estado} />
          {puntaje !== undefined && (
            <span className="chip chip-match">{Math.round(puntaje)} % similar</span>
          )}
        </span>
        <span className="pub-title">{p.titulo}</span>
        <span className="pub-meta">
          {p.categoria} · {p.sede}, {p.ubicacion ?? p.edificio}
        </span>
        <span className="pub-date" title={formatearFecha(p.fecha_suceso)}>
          {p.tipo === 'ENCONTRADO' ? 'Encontrado' : 'Perdido'} {relativo(p.fecha_suceso)}
        </span>
      </span>
    </Link>
  );
}

export function GrillaPublicaciones({
  items,
  iconos,
  vacio = 'No hay publicaciones que coincidan con estos filtros.',
}: {
  items: (ResumenPublicacion & { puntaje?: number })[];
  iconos: Record<string, string>;
  vacio?: string;
}) {
  if (items.length === 0) return <p className="empty">{vacio}</p>;
  return (
    <div className="grid-pubs">
      {items.map((p) => (
        <TarjetaPublicacion
          key={p.id}
          p={p}
          icono={iconos[p.categoria] ?? '📦'}
          puntaje={p.puntaje}
        />
      ))}
    </div>
  );
}

/** La etiqueta de cartón de objetos perdidos, con un hallazgo real. */
export function EtiquetaHallazgo({ p }: { p: ResumenPublicacion | null }) {
  const contenido = (
    <>
      <div className="t-label">Hallazgo · {p ? folio(p.id) : 'HG-0000'}</div>
      <div className="t-title">{p ? p.titulo : 'Tu objeto podría estar aquí'}</div>
      <dl>
        <dt>Sede</dt>
        <dd>{p ? p.sede : 'Cualquier sede'}</dd>
        <dt>Lugar</dt>
        <dd>{p ? (p.ubicacion ?? p.edificio) : 'Biblioteca, cafetería…'}</dd>
        <dt>Fecha</dt>
        <dd>{p ? formatearFecha(p.fecha_suceso) : 'Hoy'}</dd>
      </dl>
      {/* Decorativo: un lector de pantalla no gana nada leyendo "círculo negro" ocho veces. */}
      <div className="t-secret" aria-hidden>
        Detalle reservado 🔒 <span>●●●●●●●●</span>
      </div>
    </>
  );
  return (
    <div className="tag-wrap">
      {p ? (
        // Sin aria-label: reemplazaría el texto visible y alguien que usa control por voz
        // ("pulsa Hallazgo HG-0007") no encontraría el enlace (WCAG 2.5.3). El nombre sale
        // del contenido, con un prefijo que solo oyen los lectores de pantalla.
        <Link href={`/publicaciones/${p.id}`} className="tag">
          <span className="sr-only">Último hallazgo: </span>
          {contenido}
        </Link>
      ) : (
        <div className="tag" aria-hidden>
          {contenido}
        </div>
      )}
    </div>
  );
}

/** Aviso para pantallas que dependen de un endpoint que el backend todavía no tiene. */
export function AvisoPendiente({ endpoint, que }: { endpoint: string; que: string }) {
  return (
    <div className="note note-pendiente stack" style={{ gap: 6 }}>
      <strong>Pendiente en el backend</strong>
      <span>
        Para {que} hace falta <code className="mono">{endpoint}</code>. La propuesta de respuesta
        está en <code className="mono">frontend/docs/endpoints-pendientes.md</code>.
      </span>
    </div>
  );
}
