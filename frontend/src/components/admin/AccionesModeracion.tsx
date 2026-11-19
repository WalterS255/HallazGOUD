'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamarApi } from '@/lib/api/cliente';

// RF-27: ocultar (con motivo para el autor) o descartar el reporte.
export function AccionesModeracion({ reporteId }: { reporteId: number }) {
  const router = useRouter();
  const [ocultando, setOcultando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolver(decision: 'OCULTAR' | 'DESCARTAR') {
    setOcupado(true);
    setError(null);
    try {
      await llamarApi(`/api/admin/reportes/${reporteId}`, {
        metodo: 'PATCH',
        cuerpo: { decision, ...(motivo.trim() && { motivo: motivo.trim() }) },
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo resolver el reporte.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {ocultando ? (
        <>
          <label className="label" htmlFor={`motivo-${reporteId}`}>
            Motivo para el autor (opcional)
          </label>
          <input id={`motivo-${reporteId}`} className="field" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: la foto muestra datos personales" />
          <div className="row">
            <button type="button" className="btn btn-danger" disabled={ocupado} onClick={() => resolver('OCULTAR')}>
              Confirmar y ocultar
            </button>
            <button type="button" className="btn" onClick={() => setOcultando(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-danger" onClick={() => setOcultando(true)}>
            Ocultar publicación
          </button>
          <button type="button" className="btn" disabled={ocupado} onClick={() => resolver('DESCARTAR')}>
            Descartar reporte
          </button>
        </div>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
