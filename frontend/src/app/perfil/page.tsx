import type { Metadata } from 'next';
import { FormPerfil } from '@/components/FormPerfil';
import { formatearFecha } from '@/lib/formato';
import { usuarioOLogin } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mi perfil' };

export default async function PerfilPage() {
  const perfil = await usuarioOLogin('/perfil');
  return (
    <div className="stack" style={{ maxWidth: 520, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Mi perfil</h1>
      <p className="muted small">
        {perfil.correo} · miembro desde {formatearFecha(perfil.fecha_registro)}
      </p>
      <div className="panel">
        <FormPerfil perfil={perfil} />
      </div>
    </div>
  );
}
