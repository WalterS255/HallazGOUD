import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet, ErrorBackend } from '@/lib/api/servidor';

export const metadata: Metadata = { title: 'Activar cuenta' };

const MENSAJES: Record<string, string> = {
  TOKEN_EXPIRADO: 'El enlace venció (dura 24 horas). Ingresa con tu correo y pide uno nuevo.',
  TOKEN_USADO: 'Este enlace ya se usó. Si tu cuenta está activa, ya puedes ingresar.',
  TOKEN_INVALIDO: 'El enlace no es válido. Revisa que lo hayas copiado completo.',
};

// El correo de activación del backend apunta a /verificar/<token> (api.md §3).
export default async function VerificarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let ok = true;
  let mensaje: string;
  try {
    mensaje = (await apiGet<{ mensaje: string }>(`/auth/verificar/${encodeURIComponent(token)}`)).mensaje;
  } catch (e) {
    if (!(e instanceof ErrorBackend) || e.status >= 500) throw e;
    ok = false;
    mensaje = MENSAJES[e.codigo] ?? e.message;
  }

  return (
    <div className="stack" style={{ maxWidth: 440, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">{ok ? 'Cuenta activada' : 'No se pudo activar'}</h1>
      <p className={`note ${ok ? 'note-ok' : 'note-err'}`}>{mensaje}</p>
      <Link href="/login" className="btn btn-primary">
        Ir a ingresar
      </Link>
    </div>
  );
}
