'use client';

import { useState } from 'react';
import type { Imagen } from '@/lib/tipos';

export function Galeria({ imagenes, titulo, icono }: { imagenes: Imagen[]; titulo: string; icono: string }) {
  const [actual, setActual] = useState(0);
  const foto = imagenes[Math.min(actual, imagenes.length - 1)];

  return (
    <div>
      <div className="gallery-main">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto.url} alt={`${titulo}, foto ${actual + 1} de ${imagenes.length}`} />
        ) : (
          <span className="pub-icon" aria-hidden>
            {icono}
          </span>
        )}
      </div>
      {imagenes.length > 1 && (
        <div className="thumbs">
          {imagenes.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActual(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === actual}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url_miniatura} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {imagenes.length === 0 && <p className="muted small mt-2">Esta publicación no tiene fotos.</p>}
    </div>
  );
}
