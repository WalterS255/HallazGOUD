'use client';

import { useState } from 'react';
import { llamarApi } from '@/lib/api/cliente';
import type { Sede, TipoLugar } from '@/lib/tipos';
import { useAccion } from './useAccion';

// Clase de cada lugar: en otra sede, la misma clase vale 10 puntos de "edificio análogo"
// en el motor de coincidencias (pregunta 13.2). OTRO o "sin clasificar" no cuentan.
export const TIPOS_LUGAR: { valor: TipoLugar; texto: string }[] = [
  { valor: 'BIBLIOTECA', texto: 'Biblioteca' },
  { valor: 'CAFETERIA', texto: 'Cafetería' },
  { valor: 'LABORATORIO', texto: 'Laboratorio' },
  { valor: 'AUDITORIO', texto: 'Auditorio' },
  { valor: 'AULAS', texto: 'Aulas' },
  { valor: 'EDIFICIO_PRINCIPAL', texto: 'Edificio principal' },
  { valor: 'ADMINISTRATIVO', texto: 'Administrativo' },
  { valor: 'OTRO', texto: 'Otro' },
];

// RF-28: sedes y lugares. Una sede con lugares, o un lugar con publicaciones, no se
// borra: el backend responde 409 EN_USO y aquí se muestra su mensaje.
export function GestionSedes({ sedes }: { sedes: Sede[] }) {
  const { ocupado, error, ejecutar } = useAccion();
  const [nuevaSede, setNuevaSede] = useState('');
  const [renombrando, setRenombrando] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [lugarNuevo, setLugarNuevo] = useState<Record<number, { edificio: string; tipo: string }>>({});

  const api = (ruta: string, metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo?: object) =>
    ejecutar(() => llamarApi(`/api/admin/${ruta}`, { metodo, cuerpo }));

  return (
    <section className="panel stack" aria-labelledby="t-sedes">
      <h2 id="t-sedes">Sedes y lugares</h2>

      {sedes.map((s) => {
        const nuevo = lugarNuevo[s.id] ?? { edificio: '', tipo: '' };
        return (
          <article key={s.id} className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            {renombrando === s.id ? (
              <form
                method="post"
                className="row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await api(`sedes/${s.id}`, 'PATCH', { nombre: nombre.trim() })) setRenombrando(null);
                }}
              >
                <label className="sr-only" htmlFor={`sede-${s.id}`}>
                  Nuevo nombre de la sede {s.nombre}
                </label>
                <input id={`sede-${s.id}`} className="field" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={ocupado}>
                  Guardar
                </button>
                <button type="button" className="btn" onClick={() => setRenombrando(null)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <div className="sec-head" style={{ margin: 0 }}>
                <h3>{s.nombre}</h3>
                <span className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setRenombrando(s.id);
                      setNombre(s.nombre);
                    }}
                  >
                    Renombrar <span className="sr-only">la sede {s.nombre}</span>
                  </button>
                  <button type="button" className="btn btn-danger" disabled={ocupado} onClick={() => api(`sedes/${s.id}`, 'DELETE')}>
                    Borrar <span className="sr-only">la sede {s.nombre}</span>
                  </button>
                </span>
              </div>
            )}

            <ul className="list">
              {s.lugares.map((l) => (
                <li key={l.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span className="grow">{l.edificio}</span>
                  <label className="sr-only" htmlFor={`tipo-${l.id}`}>
                    Tipo de lugar de {l.edificio} ({s.nombre})
                  </label>
                  <select
                    id={`tipo-${l.id}`}
                    className="field"
                    style={{ width: 'auto' }}
                    value={l.tipo ?? ''}
                    disabled={ocupado}
                    onChange={(e) => api(`lugares/${l.id}`, 'PATCH', { tipo: e.target.value || null })}
                  >
                    <option value="">Sin clasificar</option>
                    {TIPOS_LUGAR.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.texto}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-danger" disabled={ocupado} onClick={() => api(`lugares/${l.id}`, 'DELETE')}>
                    Borrar <span className="sr-only">{l.edificio} de {s.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>

            <form
              method="post"
              className="row"
              style={{ flexWrap: 'wrap', gap: 8 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await api('lugares', 'POST', {
                  id_sede: s.id,
                  edificio: nuevo.edificio.trim(),
                  ...(nuevo.tipo && { tipo: nuevo.tipo }),
                });
                if (ok) setLugarNuevo((x) => ({ ...x, [s.id]: { edificio: '', tipo: '' } }));
              }}
            >
              <label className="sr-only" htmlFor={`nuevo-lugar-${s.id}`}>
                Nuevo lugar en {s.nombre}
              </label>
              <input
                id={`nuevo-lugar-${s.id}`}
                className="field"
                style={{ flex: '1 1 160px' }}
                placeholder="Nuevo lugar (ej.: Biblioteca)"
                maxLength={100}
                value={nuevo.edificio}
                onChange={(e) => setLugarNuevo((x) => ({ ...x, [s.id]: { ...nuevo, edificio: e.target.value } }))}
              />
              <label className="sr-only" htmlFor={`nuevo-tipo-${s.id}`}>
                Tipo del nuevo lugar en {s.nombre}
              </label>
              <select
                id={`nuevo-tipo-${s.id}`}
                className="field"
                style={{ width: 'auto' }}
                value={nuevo.tipo}
                onChange={(e) => setLugarNuevo((x) => ({ ...x, [s.id]: { ...nuevo, tipo: e.target.value } }))}
              >
                <option value="">Sin clasificar</option>
                {TIPOS_LUGAR.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.texto}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary" disabled={ocupado || !nuevo.edificio.trim()}>
                Agregar lugar <span className="sr-only">en {s.nombre}</span>
              </button>
            </form>
          </article>
        );
      })}

      <form
        method="post"
        className="row"
        style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await api('sedes', 'POST', { nombre: nuevaSede.trim() })) setNuevaSede('');
        }}
      >
        <label className="sr-only" htmlFor="nueva-sede">
          Nombre de la nueva sede
        </label>
        <input id="nueva-sede" className="field" style={{ flex: 1 }} placeholder="Nueva sede" maxLength={80} value={nuevaSede} onChange={(e) => setNuevaSede(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={ocupado || !nuevaSede.trim()}>
          Crear sede
        </button>
      </form>
      {error && (
        <p className="note note-err" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
