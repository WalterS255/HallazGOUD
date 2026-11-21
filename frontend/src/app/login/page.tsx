import type { Metadata } from 'next';
import Link from 'next/link';
import { FormLogin } from '@/components/auth/FormulariosAuth';
import { rutaSegura, unico, type ParamsBusqueda } from '@/lib/params';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: ParamsBusqueda }) {
  const sp = await searchParams;
  return (
    <div className="stack" style={{ maxWidth: 440, width: '100%', marginInline: 'auto' }}>
      <h1 className="titulo-pagina">Ingresar</h1>
      <div className="panel">
        <FormLogin siguiente={rutaSegura(unico(sp.siguiente))} />
      </div>
      <p className="small" style={{ textAlign: 'center' }}>
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="link">
          Regístrate con tu correo institucional
        </Link>
      </p>
    </div>
  );
}
