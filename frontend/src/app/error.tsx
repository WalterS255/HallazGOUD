'use client';

import Link from 'next/link';

export default function ErrorPagina({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div
      className="stack"
      style={{ maxWidth: 480, marginInline: 'auto', textAlign: 'center', paddingBlock: 48 }}
    >
      <h1 className="titulo-pagina">Algo salió mal</h1>
      <p className="muted">
        {process.env.NODE_ENV === 'development' && error.message
          ? error.message
          : 'Ocurrió un error inesperado. Intenta de nuevo en un momento.'}
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button type="button" onClick={reset} className="btn btn-primary">
          Reintentar
        </button>
        {/* /estado es solo para administradores; en desarrollo ayuda a diagnosticar. */}
        {process.env.NODE_ENV === 'development' && (
          <Link href="/estado" className="btn">
            Ver estado de la conexión
          </Link>
        )}
      </div>
    </div>
  );
}
