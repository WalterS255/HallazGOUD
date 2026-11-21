import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <div className="stack" style={{ maxWidth: 440, marginInline: 'auto', textAlign: 'center', paddingBlock: 48 }}>
      <div className="tag-wrap" aria-hidden>
        <div className="tag">
          <div className="t-label">Folio · 404</div>
          <div className="t-title">Página no encontrada</div>
        </div>
      </div>
      <p className="muted">Irónico, ¿no? Puede que la publicación haya sido retirada o que el enlace esté incompleto.</p>
      <Link href="/publicaciones" className="btn btn-primary" style={{ justifySelf: 'center' }}>
        Ir al catálogo
      </Link>
    </div>
  );
}
