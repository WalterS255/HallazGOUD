'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorApi, llamarApi } from '@/lib/api/cliente';
import { MAX_IMAGENES, TAMANO_MAXIMO_IMAGEN, TIPOS_IMAGEN } from '@/lib/constantes';
import { aFechaSuceso, hoyColombia, iconoCategoria } from '@/lib/formato';
import type { Catalogos, TipoPublicacion } from '@/lib/tipos';

const PASOS = ['¿Qué?', '¿Dónde y cuándo?', 'Fotos y verificación'];
// Campos del backend que se corrigen en cada paso (para volver al paso del error).
const CAMPOS_POR_PASO = [
  ['tipo', 'titulo', 'id_categoria', 'descripcion'],
  ['id_sede', 'ubicacion', 'id_lugar', 'fecha_suceso', 'fecha', 'hora'],
  ['detalle_reservado', 'imagenes'],
];

type Datos = {
  tipo: TipoPublicacion;
  titulo: string;
  id_categoria: string;
  descripcion: string;
  id_sede: string;
  ubicacion: string;
  fecha: string;
  hora: string;
  detalle_reservado: string;
};

// Asistente en 3 pasos (sección 7.6 de la propuesta, RNF-03). Crea la publicación y después sube las fotos.
/** "¡Lo tengo!" (pregunta 13.1): datos copiados del PERDIDO para no escribirlos de nuevo. */
export type Prellenado = {
  desde: { id: number; titulo: string };
  titulo: string;
  id_categoria: number;
  id_sede: number | null;
  ubicacion: string;
};

export function AsistentePublicacion({
  tipoInicial,
  catalogos,
  prellenado,
}: {
  tipoInicial: TipoPublicacion;
  catalogos: Catalogos;
  prellenado?: Prellenado;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [d, setD] = useState<Datos>({
    tipo: tipoInicial,
    titulo: prellenado?.titulo ?? '',
    id_categoria: prellenado ? String(prellenado.id_categoria) : '',
    descripcion: '',
    id_sede: prellenado?.id_sede ? String(prellenado.id_sede) : '',
    ubicacion: prellenado?.ubicacion ?? '',
    fecha: hoyColombia(),
    hora: '',
    detalle_reservado: '',
  });
  const [fotos, setFotos] = useState<File[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [creadaId, setCreadaId] = useState<number | null>(null);

  const vistas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => vistas.forEach((u) => URL.revokeObjectURL(u)), [vistas]);

  const categoria = catalogos.categorias.find((c) => String(c.id) === d.id_categoria);
  const hallazgo = d.tipo === 'ENCONTRADO';

  function cambiar(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setD((x) => ({ ...x, [name]: value }));
    setErrores((x) => ({ ...x, [name]: '' }));
  }

  // Mismas reglas que gestion.schemas.ts del backend, para avisar antes de enviar.
  function validar(n: number) {
    const e: Record<string, string> = {};
    if (n === 0) {
      if (d.titulo.trim().length < 5) e.titulo = 'El título debe tener al menos 5 caracteres';
      if (!d.id_categoria) e.id_categoria = 'Elige una categoría';
      if (d.descripcion.trim().length < 10)
        e.descripcion = 'Describe el objeto con al menos 10 caracteres';
    } else if (n === 1) {
      if (!d.id_sede) e.id_sede = 'Elige una sede';
      if (d.ubicacion.trim().length < 3)
        e.ubicacion = 'Describe el lugar con al menos 3 caracteres';
      if (!d.fecha) e.fecha = 'Indica la fecha';
      if (!d.hora) e.hora = 'Indica la hora aproximada';
      if (d.fecha && d.hora && new Date(aFechaSuceso(d.fecha, d.hora)) > new Date())
        e.fecha = 'La fecha no puede estar en el futuro';
    } else {
      if (hallazgo && d.detalle_reservado.trim().length < 3)
        e.detalle_reservado = 'Registra un detalle que sólo el dueño conocería';
      // RF-08 · pregunta 13.6 (2026-11-21): al menos una foto también en un PERDIDO.
      if (fotos.length === 0)
        e.imagenes = hallazgo
          ? 'Agrega al menos una foto del objeto'
          : 'Agrega al menos una foto: del objeto o de uno parecido';
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  function elegirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevas = Array.from(e.target.files ?? []);
    e.target.value = '';
    const mala = nuevas.find(
      (a) => !TIPOS_IMAGEN.includes(a.type) || a.size > TAMANO_MAXIMO_IMAGEN,
    );
    if (mala)
      return setErrores((x) => ({
        ...x,
        imagenes: `«${mala.name}» debe ser JPG, PNG o WEBP de máximo 5 MB`,
      }));
    setFotos((x) => [...x, ...nuevas].slice(0, MAX_IMAGENES));
    setErrores((x) => ({ ...x, imagenes: '' }));
  }

  async function publicar() {
    if (!validar(2)) return;
    setEnviando(true);
    setErrorGeneral(null);
    let id = creadaId;
    try {
      if (!id) {
        const creada = await llamarApi<{ id: number }>('/api/publicaciones', {
          metodo: 'POST',
          cuerpo: {
            tipo: d.tipo,
            titulo: d.titulo.trim(),
            descripcion: d.descripcion.trim(),
            id_categoria: Number(d.id_categoria),
            // La sede + el texto libre: el backend la deja en el lugar "General" de la sede.
            id_sede: Number(d.id_sede),
            ubicacion: d.ubicacion.trim(),
            fecha_suceso: aFechaSuceso(d.fecha, d.hora),
            // Un PERDIDO no lleva detalle reservado: el backend rechaza el campo si se envía.
            ...(hallazgo && { detalle_reservado: d.detalle_reservado.trim() }),
          },
        });
        id = creada.id;
        setCreadaId(id);
      }
      if (fotos.length > 0) {
        const formData = new FormData();
        fotos.forEach((f) => formData.append('imagenes', f));
        await llamarApi(`/api/publicaciones/${id}/imagenes`, { metodo: 'POST', formData });
      }
      router.push(`/publicaciones/${id}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ErrorApi && Object.keys(e.campos).length) {
        const campos = { ...e.campos };
        if (campos.fecha_suceso) campos.fecha = campos.fecha_suceso;
        setErrores(campos);
        const p = CAMPOS_POR_PASO.findIndex((lista) => lista.some((c) => campos[c]));
        if (p >= 0) setPaso(p);
      }
      const msg = e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
      setErrorGeneral(
        id ? `La publicación se creó, pero las fotos no se pudieron subir: ${msg}` : msg,
      );
    } finally {
      setEnviando(false);
    }
  }

  const err = (campo: string) =>
    errores[campo] ? (
      <p className="err" id={`e-${campo}`}>
        {errores[campo]}
      </p>
    ) : null;
  const inv = (campo: string) =>
    errores[campo] ? { 'aria-invalid': true, 'aria-describedby': `e-${campo}` } : {};

  return (
    <div className="wizard">
      <h1 className="titulo-pagina">Nueva publicación</h1>
      {prellenado && (
        <p className="note note-info">
          Estás publicando el hallazgo de «{prellenado.desde.titulo}». Copiamos la categoría, el
          título y el lugar: revísalos, agrega una foto y el detalle reservado. Al publicar, le
          avisamos a quien lo perdió.
        </p>
      )}
      <ol className="wsteps" aria-label="Pasos">
        {PASOS.map((n, i) => (
          <li
            key={n}
            aria-current={i === paso ? 'step' : undefined}
            className={i < paso ? 'done' : ''}
          >
            {i + 1}. {n}
          </li>
        ))}
      </ol>

      <div className="panel stack">
        {paso === 0 && (
          <>
            <div>
              <span className="label">¿Qué quieres publicar?</span>
              <div className="choice">
                {(['ENCONTRADO', 'PERDIDO'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={d.tipo === t}
                    onClick={() => setD((x) => ({ ...x, tipo: t }))}
                  >
                    {t === 'ENCONTRADO' ? 'Encontré algo' : 'Perdí algo'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="titulo">
                Título
              </label>
              <input
                id="titulo"
                name="titulo"
                className="field"
                maxLength={100}
                value={d.titulo}
                onChange={cambiar}
                placeholder="Ej.: Calculadora Casio fx-991 negra"
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
                value={d.id_categoria}
                onChange={cambiar}
                {...inv('id_categoria')}
              >
                <option value="">Selecciona…</option>
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
                maxLength={2000}
                value={d.descripcion}
                onChange={cambiar}
                {...inv('descripcion')}
                placeholder="Color, marca, tamaño, estado… No incluyas el detalle que servirá para verificar al dueño."
              />
              {err('descripcion')}
            </div>
          </>
        )}

        {paso === 1 && (
          <>
            <div>
              <label className="label" htmlFor="id_sede">
                Sede
              </label>
              <select
                id="id_sede"
                name="id_sede"
                className="field"
                value={d.id_sede}
                onChange={cambiar}
                {...inv('id_sede')}
              >
                <option value="">Selecciona…</option>
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
                value={d.ubicacion}
                onChange={cambiar}
                {...inv('ubicacion')}
                placeholder={
                  hallazgo
                    ? 'Ej.: Edificio Sabio Caldas, cuarto piso, al lado de una mesa'
                    : 'Ej.: Biblioteca, segundo piso, cerca de los computadores'
                }
              />
              {err('ubicacion')}
            </div>
            <div className="two">
              <div>
                <label className="label" htmlFor="fecha">
                  Fecha
                </label>
                <input
                  id="fecha"
                  name="fecha"
                  type="date"
                  className="field"
                  max={hoyColombia()}
                  value={d.fecha}
                  onChange={cambiar}
                  {...inv('fecha')}
                />
                {err('fecha')}
              </div>
              <div>
                <label className="label" htmlFor="hora">
                  Hora aproximada
                </label>
                <input
                  id="hora"
                  name="hora"
                  type="time"
                  className="field"
                  value={d.hora}
                  onChange={cambiar}
                  {...inv('hora')}
                />
                {err('hora')}
              </div>
            </div>
          </>
        )}

        {paso === 2 && (
          <>
            {categoria?.sensible && (
              <p className="note note-info">
                <strong>Objeto sensible.</strong> Tapa números de documento, tarjetas o datos
                personales antes de tomar la foto. Se recomienda entregarlo en la oficina de
                seguridad de la facultad.
              </p>
            )}
            <div>
              <span className="label">
                Fotos · hasta {MAX_IMAGENES}, JPG, PNG o WEBP de máximo 5 MB
              </span>
              {!hallazgo && (
                <p className="muted small">
                  ¿No tienes una foto de tu objeto? Sube una de uno igual o parecido: ayuda a que
                  quien lo encuentre lo reconozca.
                </p>
              )}
              <div className="photos">
                {vistas.map((src, i) => (
                  <div key={src} className="photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Foto ${i + 1}`} />
                    <button
                      type="button"
                      aria-label={`Quitar foto ${i + 1}`}
                      onClick={() => setFotos((x) => x.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {fotos.length < MAX_IMAGENES && (
                  <label className="add-photo">
                    + Agregar
                    <input
                      type="file"
                      accept={TIPOS_IMAGEN.join(',')}
                      multiple
                      onChange={elegirFotos}
                    />
                  </label>
                )}
              </div>
              {err('imagenes')}
            </div>
            {hallazgo && (
              <div>
                <label className="label" htmlFor="detalle_reservado">
                  Detalle reservado
                </label>
                <textarea
                  id="detalle_reservado"
                  name="detalle_reservado"
                  className="field"
                  rows={2}
                  maxLength={500}
                  value={d.detalle_reservado}
                  onChange={cambiar}
                  {...inv('detalle_reservado')}
                  placeholder="Un rasgo que no se ve en las fotos: un sticker, una marca, lo que tenía adentro…"
                />
                <p className="muted small mt-1">
                  🔒 Nadie más lo verá. Quien reclame deberá describirlo para demostrar que es suyo.
                </p>
                {err('detalle_reservado')}
              </div>
            )}
          </>
        )}

        {errorGeneral && (
          <p className="note note-err" role="alert">
            {errorGeneral}{' '}
            {creadaId && (
              <Link href={`/publicaciones/${creadaId}`} className="underline">
                Ver publicación
              </Link>
            )}
          </p>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          {paso > 0 ? (
            <button
              type="button"
              className="btn"
              onClick={() => (setErrores({}), setPaso(paso - 1))}
            >
              ← Atrás
            </button>
          ) : (
            <span />
          )}
          {paso < 2 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => validar(paso) && setPaso(paso + 1)}
            >
              Siguiente →
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={publicar}
              disabled={enviando}
            >
              {enviando ? 'Publicando…' : 'Publicar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
