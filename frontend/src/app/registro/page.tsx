import type { Metadata } from 'next';
import Link from 'next/link';
import { FormRegistro } from '@/components/auth/FormulariosAuth';
import { config } from '@/lib/config';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegistroPage() {
  return (
    <div className="stack" style={{ maxWidth: 440, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Crear cuenta</h1>
      <p className="muted small">
        Sólo para la comunidad de la Universidad Distrital. Te enviaremos un enlace de activación a
        tu correo institucional.
      </p>
      <div className="panel">
        <FormRegistro dominio={config.dominio} />
      </div>
      <p className="small" style={{ textAlign: 'center' }}>
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="link">
          Ingresa
        </Link>
      </p>
    </div>
  );
}
