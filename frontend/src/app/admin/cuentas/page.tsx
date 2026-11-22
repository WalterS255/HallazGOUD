import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GestionCuentas } from '@/components/admin/GestionCuentas';
import { apiGet } from '@/lib/api/servidor';
import { unico, type ParamsBusqueda } from '@/lib/params';
import { usuarioOLogin } from '@/lib/sesion';
import type { CuentaAdmin } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Cuentas' };

// RF-29: buscar cuentas (por nombre o correo EXACTO) y suspender o reactivar. Solo ADMIN.
export default async function CuentasAdminPage({ searchParams }: { searchParams: ParamsBusqueda }) {
  const usuario = await usuarioOLogin('/admin/cuentas');
  if (usuario.rol !== 'ADMIN') redirect('/admin');

  const q = (unico((await searchParams).q) ?? '').trim();
  // El backend pide al menos 2 letras; sin búsqueda no se lista a nadie.
  const cuentas =
    q.length >= 2
      ? await apiGet<CuentaAdmin[]>(`/admin/usuarios?q=${encodeURIComponent(q)}`)
      : null;

  return (
    <>
      <Link href="/admin" className="link" style={{ justifySelf: 'start' }}>
        ← Administración
      </Link>
      <h1 className="titulo-pagina">Cuentas</h1>
      <form method="get" role="search" className="panel stack" style={{ gap: 8 }}>
        <label className="label" htmlFor="q">
          Buscar por nombre o por correo exacto
        </label>
        <div className="row">
          <input
            id="q"
            name="q"
            className="field"
            style={{ flex: 1 }}
            minLength={2}
            defaultValue={q}
            placeholder="Ej.: Luis Gómez"
          />
          <button type="submit" className="btn btn-primary">
            Buscar
          </button>
        </div>
        <p className="muted small">
          Por privacidad, los resultados no muestran el correo (regla 6.3).
        </p>
      </form>
      {cuentas && <GestionCuentas cuentas={cuentas} miId={usuario.id} />}
    </>
  );
}
