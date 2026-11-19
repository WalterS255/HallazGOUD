'use client';

import { useEffect, useRef, useState } from 'react';
import { ErrorApi, llamarApi } from '@/lib/api/cliente';
import { formatearFechaHora } from '@/lib/formato';
import type { Mensaje } from '@/lib/tipos';

type Props = {
  reclamacionId: number;
  miId: number;
  contraparte: string;
  mensajesIniciales: Mensaje[];
  entregada: boolean;
};

// El backend no tiene tiempo real: se vuelve a pedir el hilo cada 10 s (api.md §10).
const INTERVALO_MS = 10_000;

export function Chat({ reclamacionId, miId, contraparte, mensajesIniciales, entregada: entregadaInicial }: Props) {
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El backend sólo dice si la entrega quedó cerrada; no expone quién ya confirmó.
  const [entrega, setEntrega] = useState<'pendiente' | 'yo-confirme' | 'entregada'>(entregadaInicial ? 'entregada' : 'pendiente');
  const [cerrado, setCerrado] = useState(entregadaInicial);
  const log = useRef<HTMLDivElement>(null);
  const url = `/api/reclamaciones/${reclamacionId}`;

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        setMensajes(await llamarApi<Mensaje[]>(`${url}/mensajes`));
      } catch {
        // Se reintenta en el siguiente ciclo.
      }
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [url]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [mensajes.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      const nuevo = await llamarApi<{ id: number; contenido: string; fecha_envio: string }>(`${url}/mensajes`, {
        metodo: 'POST',
        cuerpo: { contenido: texto },
      });
      setMensajes((m) => [...m, { ...nuevo, leido: false, emisor: { id: miId, nombre: 'Tú' } }]);
      setTexto('');
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'CHAT_CERRADO') setCerrado(true);
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar() {
    setError(null);
    try {
      const r = await llamarApi<{ entregada: boolean }>(`${url}/entrega`, { metodo: 'POST' });
      setEntrega(r.entregada ? 'entregada' : 'yo-confirme');
      if (r.entregada) setCerrado(true);
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'ENTREGA_CERRADA') {
        setEntrega('entregada');
        setCerrado(true);
      } else setError(err instanceof Error ? err.message : 'No se pudo confirmar la entrega.');
    }
  }

  return (
    <div className="chat-layout">
      <div className="chat">
        <div ref={log} className="chat-log" aria-live="polite" aria-label={`Conversación con ${contraparte}`}>
          {mensajes.length === 0 && (
            <p className="muted small" style={{ textAlign: 'center' }}>
              Escribe el primer mensaje. Acuerden un lugar dentro del campus y no compartan datos personales.
            </p>
          )}
          {mensajes.map((m) => {
            const mio = m.emisor.id === miId;
            return (
              <div key={m.id} className={`bubble ${mio ? 'mine' : 'theirs'}`}>
                {m.contenido}
                <time>
                  {formatearFechaHora(m.fecha_envio)}
                  {mio && m.leido && ' · Leído'}
                </time>
              </div>
            );
          })}
        </div>
        {cerrado ? (
          <p className="muted small" style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
            La entrega se confirmó: el chat quedó en solo lectura.
          </p>
        ) : (
          <form onSubmit={enviar}>
            <label htmlFor="chat-txt" className="sr-only">
              Mensaje
            </label>
            <input id="chat-txt" className="field" maxLength={2000} autoComplete="off" placeholder="Escribe un mensaje…"
              value={texto} onChange={(e) => setTexto(e.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={enviando || !texto.trim()}>
              Enviar
            </button>
          </form>
        )}
      </div>

      <aside className="panel stack">
        <h2>Entrega</h2>
        {entrega === 'entregada' ? (
          <p className="note note-ok">Entrega confirmada por ambas partes. ¡Gracias por usar HallazGO UD!</p>
        ) : entrega === 'yo-confirme' ? (
          <p className="note note-info">Confirmaste la entrega. Falta que {contraparte} también la confirme.</p>
        ) : (
          <>
            <p className="muted small">
              Cuando el objeto esté en manos de su dueño, ambos confirman. Con la doble confirmación la publicación queda
              como entregada.
            </p>
            <button type="button" className="btn btn-primary" onClick={confirmar}>
              Confirmar entrega
            </button>
          </>
        )}
        {error && (
          <p className="note note-err" role="alert">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}
