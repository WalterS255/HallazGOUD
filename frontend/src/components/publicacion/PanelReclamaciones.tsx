'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enlaceChat } from '@/lib/adaptar';
import { llamarApi } from '@/lib/api/cliente';
import { ETIQUETA_RECLAMACION, formatearFechaHora } from '@/lib/formato';
import type { ReclamacionesDePublicacion } from '@/lib/tipos';

// RF-19: el autor compara cada respuesta con su detalle reservado y decide.
export function PanelReclamaciones({
  publicacionId,
  datos,
}: {
  publicacionId: number;
  datos: ReclamacionesDePublicacion;
}) {
  const router = useRouter();
  const [procesando, setProcesando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hayAceptada = datos.reclamaciones.some((r) => r.estado === 'ACEPTADA');

  async function decidir(id: number, decision: 'ACEPTAR' | 'RECHAZAR') {
    setProcesando(id);
    setError(null);
    try {
      await llamarApi(`/api/reclamaciones/${id}`, { metodo: 'PATCH', cuerpo: { decision } });
      if (decision === 'ACEPTAR') router.push(enlaceChat(id, publicacionId));
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la decisión.');
    } finally {
      setProcesando(null);
    }
  }

  return (
    <section id="reclamaciones" className="panel stack" aria-labelledby="t-reclamaciones">
      {datos.detalle_reservado && (
        <p className="note note-lock">
          <strong>Tu detalle reservado:</strong> {datos.detalle_reservado}
          <br />
          <span className="small">Sólo tú lo ves. Compáralo con cada reclamación.</span>
        </p>
      )}
      <h3 id="t-reclamaciones">Reclamaciones ({datos.reclamaciones.length})</h3>
      {error && (
        <p className="note note-err" role="alert">
          {error}
        </p>
      )}
      {datos.reclamaciones.length === 0 ? (
        <p className="muted small">Todavía nadie lo ha reclamado.</p>
      ) : (
        datos.reclamaciones.map((r) => (
          <div key={r.id} className="claim">
            <div className="claim-head">
              <strong>{r.reclamante.nombre}</strong>
              <span className="muted">
                {formatearFechaHora(r.fecha)} ·{' '}
                <span className={`chip chip-${r.estado}`}>{ETIQUETA_RECLAMACION[r.estado]}</span>
              </span>
            </div>
            <p>
              <strong>Respuesta:</strong> {r.respuesta_detalle}
            </p>
            {r.evidencia_url && (
              <p className="small">
                <strong>Evidencia:</strong>{' '}
                <a
                  href={r.evidencia_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="link"
                >
                  abrir enlace
                </a>
              </p>
            )}
            {r.estado === 'PENDIENTE' && (
              <div className="row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={procesando === r.id || hayAceptada}
                  title={hayAceptada ? 'Ya aceptaste otra reclamación' : undefined}
                  onClick={() => decidir(r.id, 'ACEPTAR')}
                >
                  Aceptar y abrir chat
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={procesando === r.id}
                  onClick={() => decidir(r.id, 'RECHAZAR')}
                >
                  Rechazar
                </button>
              </div>
            )}
            {r.estado === 'ACEPTADA' && (
              <div>
                <Link href={enlaceChat(r.id, publicacionId)} className="btn">
                  Abrir chat de entrega
                </Link>
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
