import type { Metadata } from 'next';
import { FormRecuperar } from '@/components/auth/FormulariosAuth';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function RecuperarPage() {
  return (
    <div className="stack" style={{ maxWidth: 440, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Recuperar contraseña</h1>
      <p className="muted small">
        Escribe tu correo institucional y te enviaremos un enlace válido por una hora.
      </p>
      <div className="panel">
        <FormRecuperar />
      </div>
    </div>
  );
}
