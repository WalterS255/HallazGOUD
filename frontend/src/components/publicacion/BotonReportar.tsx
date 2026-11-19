'use client';

import { useState } from 'react';
import { errorDeCampo, llamarApi } from '@/lib/api/cliente';

// RF-26
export function BotonReportar({ publicacionId }: { publicacionId: number }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState<'inicial' | 'enviando' | 'listo'>('inicial');
  const [error, setError] = useState<unknown>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado('enviando');
    setError(null);
    try {
      await llamarApi('/api/reportes', { metodo: 'POST', cuerpo: { id_publicacion: publicacionId, motivo } });
      setEstado('listo');
    } catch (err) {
      setError(err);
      setEstado('inicial');
    }
  }

  if (estado === 'listo') {
    return (
      <p className="note note-ok" role="status">
        Gracias. Un moderador revisará la publicación.
      </p>
    );
  }

  if (!abierto) {
    return (
      <button type="button" className="link small" style={{ color: 'var(--muted)', justifySelf: 'start' }} onClick={() => setAbierto(true)}>
        Reportar publicación
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="stack" noValidate>
      <div>
        <label className="label" htmlFor="motivo">
          ¿Por qué la reportas?
        </label>
        <textarea
          id="motivo"
          className="field"
          rows={2}
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Contenido inadecuado, sospecha de fraude, datos personales visibles…"
        />
        {(errorDeCampo(error, 'motivo') || error instanceof Error) && (
          <p className="err" role="alert">
            {errorDeCampo(error, 'motivo') ?? (error as Error).message}
          </p>
        )}
      </div>
      <div className="row">
        <button type="submit" className="btn btn-danger" disabled={estado === 'enviando'}>
          Enviar reporte
        </button>
        <button type="button" className="btn" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
