'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorApi, llamarApi } from '@/lib/api/cliente';
import { aFechaSuceso, hoyColombia, iconoCategoria } from '@/lib/formato';
import type { Catalogos } from '@/lib/tipos';

export type ValoresEdicion = {
  titulo: string;
  id_categoria: string;
  descripcion: string;
  id_sede: string;
  ubicacion: string;
  fecha: string;
  hora: string;
  detalle_reservado: string;
};

type Props = {
  publicacionId: number;
  esHallazgo: boolean;
  // Con reclamaciones, el backend no deja cambiar el detalle reservado (409 DETALLE_BLOQUEADO):
  // cambiarlo permitiría "ajustarlo" a la respuesta de alguien.
  detalleBloqueado: boolean;
  iniciales: ValoresEdicion;
  catalogos: Catalogos;
};

// RF-10: el autor edita su publicación mientras no esté entregada, expirada ni retirada.
// Solo se envían los campos que cambiaron (el backend exige que cambie al menos uno).
export function FormEditarPublicacion({
  publicacionId,
  esHallazgo,
  detalleBloqueado,
  iniciales,
  catalogos,
}: Props) {
  const router = useRouter();
  const [v, setV] = useState(iniciales);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setV((x) => ({ ...x, [e.target.name]: e.target.value }));
  const err = (campo: string) =>
    errores[campo] ? (
      <p id={`${campo}-error`} className="err" role="alert">
        {errores[campo]}
      </p>
    ) : null;
  const inv = (campo: string) =>
    errores[campo] ? { 'aria-invalid': true, 'aria-describedby': `${campo}-error` } : {};

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const cambios: Record<string, unknown> = {};
    if (v.titulo !== iniciales.titulo) cambios.titulo = v.titulo;
    if (v.descripcion !== iniciales.descripcion) cambios.descripcion = v.descripcion;
    if (v.id_categoria !== iniciales.id_categoria) cambios.id_categoria = Number(v.id_categoria);
    // Con la sede va también la ubicación: el backend la pide para ubicar la publicación.
    if (v.id_sede !== iniciales.id_sede) {
      cambios.id_sede = Number(v.id_sede);
      cambios.ubicacion = v.ubicacion.trim();
    }
    if (v.ubicacion !== iniciales.ubicacion) cambios.ubicacion = v.ubicacion.trim();
    if (v.fecha !== iniciales.fecha || v.hora !== iniciales.hora)
      cambios.fecha_suceso = aFechaSuceso(v.fecha, v.hora);
    if (esHallazgo && !detalleBloqueado && v.detalle_reservado !== iniciales.detalle_reservado) {
      cambios.detalle_reservado = v.detalle_reservado;
    }
    if (Object.keys(cambios).length === 0) {
      setError('No cambiaste nada.');
      return;
    }

    setGuardando(true);
    setError(null);
    setErrores({});
    try {
      await llamarApi(`/api/publicaciones/${publicacionId}`, { metodo: 'PUT', cuerpo: cambios });
      router.push(`/publicaciones/${publicacionId}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ErrorApi) {
        // fecha_suceso se muestra junto a la fecha (son dos campos en pantalla).
        const campos = { ...e.campos };
        if (campos.fecha_suceso) campos.fecha = campos.fecha_suceso;
        setErrores(campos);
      }
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setGuardando(false);
    }
  }

  return (
    <form method="post" onSubmit={guardar} className="panel stack" noValidate>
      <div>
        <label className="label" htmlFor="titulo">
          Título
        </label>
        <input
          id="titulo"
          name="titulo"
          className="field"
          maxLength={120}
          value={v.titulo}
          onChange={cambiar}
          {...inv('titulo')}
        />
        {err('titulo')}
      </div>

      <div>
        <label className="label" htmlFor="id_categoria">
          Categoría
        </label>
        <select
          id="id_categoria"
          name="id_categoria"
          className="field"
          value={v.id_categoria}
          onChange={cambiar}
          {...inv('id_categoria')}
        >
          {catalogos.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {iconoCategoria(c.icono)} {c.nombre}
            </option>
          ))}
        </select>
        {err('id_categoria')}
      </div>

      <div>
        <label className="label" htmlFor="descripcion">
          Descripción
        </label>
        <textarea
          id="descripcion"
          name="descripcion"
          className="field"
          rows={4}
          maxLength={1000}
          value={v.descripcion}
          onChange={cambiar}
          {...inv('descripcion')}
        />
        {err('descripcion')}
      </div>

      <div>
        <label className="label" htmlFor="id_sede">
          Sede
        </label>
        <select
          id="id_sede"
          name="id_sede"
          className="field"
          value={v.id_sede}
          onChange={cambiar}
          {...inv('id_sede')}
        >
          {catalogos.sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        {err('id_sede')}
      </div>

      <div>
        <label className="label" htmlFor="ubicacion">
          ¿Dónde exactamente?
        </label>
        <textarea
          id="ubicacion"
          name="ubicacion"
          className="field"
          rows={2}
          maxLength={200}
          value={v.ubicacion}
          onChange={cambiar}
          {...inv('ubicacion')}
          placeholder="Ej.: cuarto piso, al lado de una mesa"
        />
        {err('ubicacion')}
      </div>

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label className="label" htmlFor="fecha">
            Fecha
          </label>
          <input
            id="fecha"
            name="fecha"
            type="date"
            className="field"
            max={hoyColombia()}
            value={v.fecha}
            onChange={cambiar}
            {...inv('fecha')}
          />
          {err('fecha')}
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label className="label" htmlFor="hora">
            Hora aproximada
          </label>
          <input
            id="hora"
            name="hora"
            type="time"
            className="field"
            value={v.hora}
            onChange={cambiar}
          />
        </div>
      </div>

      {esHallazgo && (
        <div>
          <label className="label" htmlFor="detalle_reservado">
            Detalle reservado
          </label>
          <textarea
            id="detalle_reservado"
            name="detalle_reservado"
            className="field"
            rows={2}
            value={v.detalle_reservado}
            onChange={cambiar}
            disabled={detalleBloqueado}
            aria-describedby="detalle-ayuda"
            {...inv('detalle_reservado')}
          />
          <p id="detalle-ayuda" className="muted small">
            {detalleBloqueado
              ? '🔒 Ya hay reclamaciones: el detalle reservado no se puede cambiar, para que nadie lo ajuste a una respuesta.'
              : '🔒 Nadie más lo verá. Quien reclame deberá describirlo.'}
          </p>
          {err('detalle_reservado')}
        </div>
      )}

      {error && (
        <p className="note note-err" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ gap: 8 }}>
        <Link href={`/publicaciones/${publicacionId}`} className="btn">
          Cancelar
        </Link>
        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
