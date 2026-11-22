'use client';

import { useState } from 'react';
import { llamarApi } from '@/lib/api/cliente';
import { ICONOS_CATEGORIA, iconoCategoria } from '@/lib/formato';
import type { CategoriaAdmin } from '@/lib/tipos';
import { useAccion } from './useAccion';

// RF-28: el admin crea, renombra, marca como sensible y activa o desactiva categorías.
// No se borran: se DESACTIVAN (las publicaciones viejas siguen apuntando a ellas).
export function GestionCategorias({ categorias }: { categorias: CategoriaAdmin[] }) {
  const { ocupado, error, ejecutar } = useAccion();
  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState('box');
  const [sensible, setSensible] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');

  const cambiar = (id: number, datos: object) =>
    ejecutar(() => llamarApi(`/api/admin/categorias/${id}`, { metodo: 'PATCH', cuerpo: datos }));

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const ok = await ejecutar(() =>
      llamarApi('/api/admin/categorias', {
        metodo: 'POST',
        cuerpo: { nombre: nombre.trim(), icono, sensible },
      }),
    );
    if (ok) {
      setNombre('');
      setSensible(false);
    }
  }

  return (
    <section className="panel stack" aria-labelledby="t-categorias">
      <h2 id="t-categorias">Categorías</h2>
      <ul className="list">
        {categorias.map((c) => (
          <li key={c.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8 }}>
            {editando === c.id ? (
              <form
                method="post"
                className="row grow"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await cambiar(c.id, { nombre: nuevoNombre.trim() })) setEditando(null);
                }}
              >
                <label className="sr-only" htmlFor={`cat-${c.id}`}>
                  Nuevo nombre de {c.nombre}
                </label>
                <input
                  id={`cat-${c.id}`}
                  className="field grow"
                  maxLength={60}
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={ocupado}>
                  Guardar
                </button>
                <button type="button" className="btn" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <span className="grow">
                  <span aria-hidden>{iconoCategoria(c.icono)} </span>
                  <strong>{c.nombre}</strong>
                  {c.sensible && <span className="chip chip-alerta">Sensible</span>}
                  {!c.activa && <span className="chip chip-RETIRADA">Desactivada</span>}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditando(c.id);
                      setNuevoNombre(c.nombre);
                    }}
                  >
                    Renombrar <span className="sr-only">{c.nombre}</span>
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={ocupado}
                    onClick={() => cambiar(c.id, { sensible: !c.sensible })}
                  >
                    {c.sensible ? 'Quitar sensible' : 'Marcar sensible'}{' '}
                    <span className="sr-only">{c.nombre}</span>
                  </button>
                  <button
                    type="button"
                    className={c.activa ? 'btn btn-danger' : 'btn'}
                    disabled={ocupado}
                    onClick={() => cambiar(c.id, { activa: !c.activa })}
                  >
                    {c.activa ? 'Desactivar' : 'Activar'}{' '}
                    <span className="sr-only">{c.nombre}</span>
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <form method="post" onSubmit={crear} className="stack" style={{ gap: 8 }}>
        <h3>Nueva categoría</h3>
        <div>
          <label className="label" htmlFor="cat-nombre">
            Nombre
          </label>
          <input
            id="cat-nombre"
            className="field"
            required
            maxLength={60}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="cat-icono">
            Ícono
          </label>
          <select
            id="cat-icono"
            className="field"
            value={icono}
            onChange={(e) => setIcono(e.target.value)}
          >
            {Object.entries(ICONOS_CATEGORIA).map(([clave, emoji]) => (
              <option key={clave} value={clave}>
                {emoji} {clave}
              </option>
            ))}
          </select>
        </div>
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={sensible}
            onChange={(e) => setSensible(e.target.checked)}
          />
          Sensible (documentos, tarjetas, llaves): el formulario pide tapar datos personales
        </label>
        <button type="submit" className="btn btn-primary" disabled={ocupado || !nombre.trim()}>
          Crear categoría
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
