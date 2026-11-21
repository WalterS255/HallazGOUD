'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorDeCampo, llamarApi } from '@/lib/api/cliente';

// RF-18: el reclamante describe el detalle que el autor no publicó.
export function FormReclamar({ publicacionId, autor }: { publicacionId: number; autor: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [listo, setListo] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const evidencia = String(f.get('evidencia_url') ?? '').trim();
    setEnviando(true);
    setError(null);
    try {
      await llamarApi(`/api/publicaciones/${publicacionId}/reclamaciones`, {
        metodo: 'POST',
        cuerpo: { respuesta_detalle: f.get('respuesta_detalle'), ...(evidencia && { evidencia_url: evidencia }) },
      });
      setListo(true);
      router.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <p className="note note-ok" role="status">
        Reclamación enviada. {autor} recibirá un aviso y revisará tu respuesta.
      </p>
    );
  }

  if (!abierto) {
    return (
      <button type="button" className="btn btn-primary btn-big" onClick={() => setAbierto(true)}>
        Es mío, quiero reclamarlo
      </button>
    );
  }

  return (
    <form method="post" onSubmit={enviar} className="panel stack" noValidate>
      <h3>Reclamar este objeto</h3>
      <p className="muted small">
        Quien lo encontró guardó un detalle que no aparece en la publicación. Descríbelo para demostrar que es tuyo.
      </p>
      <div>
        <label className="label" htmlFor="respuesta_detalle">
          Detalle distintivo
        </label>
        <textarea
          id="respuesta_detalle"
          name="respuesta_detalle"
          className="field"
          rows={3}
          maxLength={1000}
          required
          placeholder="Ej.: tiene un sticker en la parte de atrás"
          aria-invalid={!!errorDeCampo(error, 'respuesta_detalle')}
        />
        {errorDeCampo(error, 'respuesta_detalle') && <p className="err">{errorDeCampo(error, 'respuesta_detalle')}</p>}
      </div>
      <div>
        <label className="label" htmlFor="evidencia_url">
          Enlace a una evidencia (opcional)
        </label>
        <input
          id="evidencia_url"
          name="evidencia_url"
          type="url"
          className="field"
          placeholder="https://… (foto tuya con el objeto, factura…)"
          aria-invalid={!!errorDeCampo(error, 'evidencia_url')}
        />
        {errorDeCampo(error, 'evidencia_url') && <p className="err">{errorDeCampo(error, 'evidencia_url')}</p>}
      </div>
      {error instanceof Error && !errorDeCampo(error, 'respuesta_detalle') && !errorDeCampo(error, 'evidencia_url') && (
        <p className="note note-err" role="alert">
          {error.message}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar reclamación'}
        </button>
        <button type="button" className="btn" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
