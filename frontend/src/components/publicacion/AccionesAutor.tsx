'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamarApi } from '@/lib/api/cliente';
import { MAX_IMAGENES, TAMANO_MAXIMO_IMAGEN, TIPOS_IMAGEN } from '@/lib/constantes';
import type { Imagen } from '@/lib/tipos';

export function AccionesAutor({
  publicacionId,
  imagenes,
  editable,
}: {
  publicacionId: number;
  imagenes: Imagen[];
  editable: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(accion: () => Promise<unknown>, despues?: () => void) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      despues ? despues() : router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(false);
    }
  }

  function subirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    const malo = archivos.find((a) => !TIPOS_IMAGEN.includes(a.type) || a.size > TAMANO_MAXIMO_IMAGEN);
    if (malo) return setError(`«${malo.name}» debe ser JPG, PNG o WEBP de máximo 5 MB.`);
    if (archivos.length + imagenes.length > MAX_IMAGENES) return setError(`Máximo ${MAX_IMAGENES} fotos por publicación.`);
    const formData = new FormData();
    archivos.forEach((a) => formData.append('imagenes', a));
    ejecutar(() => llamarApi(`/api/publicaciones/${publicacionId}/imagenes`, { metodo: 'POST', formData }));
  }

  if (!editable) return null;

  return (
    <section className="panel stack" aria-labelledby="t-mi-publicacion">
      <div className="sec-head" style={{ margin: 0 }}>
        <h2 id="t-mi-publicacion">Tu publicación</h2>
        {confirmarRetiro ? (
          <div className="row">
            <span className="small">¿Retirarla del catálogo?</span>
            <button
              type="button"
              className="btn btn-danger"
              disabled={ocupado}
              onClick={() =>
                ejecutar(
                  () => llamarApi(`/api/publicaciones/${publicacionId}`, { metodo: 'DELETE' }),
                  () => router.push('/mis-publicaciones'),
                )
              }
            >
              Sí, retirar
            </button>
            <button type="button" className="btn" onClick={() => setConfirmarRetiro(false)}>
              No
            </button>
          </div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            {/* RF-10: editar título, categoría, descripción, lugar, fecha y detalle reservado. */}
            <Link href={`/publicaciones/${publicacionId}/editar`} className="btn">
              Editar
            </Link>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmarRetiro(true)}>
              Retirar publicación
            </button>
          </div>
        )}
      </div>

      <div>
        <span className="label">
          Fotos ({imagenes.length} de {MAX_IMAGENES})
        </span>
        <div className="photos">
          {imagenes.map((img) => (
            <div key={img.url} className="photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url_miniatura} alt={`Foto ${img.orden}`} />
              <button
                type="button"
                aria-label={`Quitar foto ${img.orden}`}
                disabled={ocupado}
                onClick={() =>
                  ejecutar(() => llamarApi(`/api/publicaciones/${publicacionId}/imagenes/${img.orden}`, { metodo: 'DELETE' }))
                }
              >
                ✕
              </button>
            </div>
          ))}
          {imagenes.length < MAX_IMAGENES && (
            <label className="add-photo">
              {ocupado ? 'Subiendo…' : '+ Agregar'}
              <input type="file" accept={TIPOS_IMAGEN.join(',')} multiple disabled={ocupado} onChange={subirFotos} />
            </label>
          )}
        </div>
      </div>
      {error && (
        <p className="note note-err" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
