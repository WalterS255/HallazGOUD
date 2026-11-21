import type { Metadata } from 'next';
import { FormRestablecer } from '@/components/auth/FormulariosAuth';

export const metadata: Metadata = { title: 'Nueva contraseña' };

// El correo de recuperación del backend apunta a /restablecer/<token> (api.md §3).
export default async function RestablecerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="stack" style={{ maxWidth: 440, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Nueva contraseña</h1>
      <div className="panel">
        <FormRestablecer token={token} />
      </div>
    </div>
  );
}
