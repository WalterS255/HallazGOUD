'use client';

import { useState } from 'react';
import { llamarApi } from '@/lib/api/cliente';
import { formatearFecha } from '@/lib/formato';
import type { CuentaAdmin } from '@/lib/tipos';
import { useAccion } from './useAccion';

// RF-29: suspender (con motivo, que le llega a la persona) o reactivar una cuenta.
// La suspensión corta la sesión AL INSTANTE (el backend revisa la cuenta en cada
// petición). La búsqueda nunca devuelve el correo (regla 6.3).
export function GestionCuentas({ cuentas, miId }: { cuentas: CuentaAdmin[]; miId: number }) {
  const { ocupado, error, ejecutar } = useAccion();
  const [suspendiendo, setSuspendiendo] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');

  const accion = (id: number, cuerpo: object) =>
    ejecutar(() => llamarApi(`/api/admin/usuarios/${id}`, { metodo: 'PATCH', cuerpo }));

  if (cuentas.length === 0) return <p className="empty">No hay cuentas que coincidan.</p>;

  return (
    <div className="stack">
      <ul className="list">
        {cuentas.map((c) => (
          <li key={c.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="grow">
              <strong>{c.nombre ?? '(cuenta borrada)'}</strong>
              <span className="muted small">
                {c.programa ?? '—'} · {c.rol} · desde {formatearFecha(c.fecha_registro)}
                {!c.verificado && ' · sin verificar'}
              </span>
            </span>
            <span className={`chip chip-${c.estado_cuenta === 'ACTIVA' ? 'ACTIVA' : 'RETIRADA'}`}>
              {c.estado_cuenta === 'ACTIVA'
                ? 'Activa'
                : c.estado_cuenta === 'SUSPENDIDA'
                  ? 'Suspendida'
                  : 'Borrada'}
            </span>
            {c.id === miId || c.estado_cuenta === 'ELIMINADA' ? null : c.estado_cuenta ===
              'SUSPENDIDA' ? (
              <button
                type="button"
                className="btn"
                disabled={ocupado}
                onClick={() => accion(c.id, { accion: 'REACTIVAR' })}
              >
                Reactivar <span className="sr-only">a {c.nombre}</span>
              </button>
            ) : suspendiendo === c.id ? (
              <form
                method="post"
                className="stack"
                style={{ gap: 6, flexBasis: '100%' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await accion(c.id, {
                    accion: 'SUSPENDER',
                    ...(motivo.trim() && { motivo: motivo.trim() }),
                  });
                  if (ok) {
                    setSuspendiendo(null);
                    setMotivo('');
                  }
                }}
              >
                <label className="label" htmlFor={`motivo-${c.id}`}>
                  Motivo (se le envía a la persona)
                </label>
                <input
                  id={`motivo-${c.id}`}
                  className="field"
                  maxLength={300}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: publicaciones falsas"
                />
                <div className="row">
                  <button type="submit" className="btn btn-danger" disabled={ocupado}>
                    Confirmar suspensión
                  </button>
                  <button type="button" className="btn" onClick={() => setSuspendiendo(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setSuspendiendo(c.id)}
              >
                Suspender <span className="sr-only">a {c.nombre}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="note note-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
