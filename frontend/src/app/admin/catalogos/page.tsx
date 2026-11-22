import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GestionCategorias } from '@/components/admin/GestionCategorias';
import { GestionSedes } from '@/components/admin/GestionSedes';
import { apiGet } from '@/lib/api/servidor';
import { usuarioOLogin } from '@/lib/sesion';
import type { CategoriaAdmin, Catalogos } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Catálogos' };

// RF-28: categorías, sedes y lugares. Solo ADMIN (el backend lo exige igual: @Roles('ADMIN')).
export default async function CatalogosAdminPage() {
  const usuario = await usuarioOLogin('/admin/catalogos');
  if (usuario.rol !== 'ADMIN') redirect('/admin');

  const [categorias, catalogos] = await Promise.all([
    apiGet<CategoriaAdmin[]>('/admin/categorias'), // todas, también las desactivadas
    apiGet<Catalogos>('/catalogos'),
  ]);

  return (
    <>
      <Link href="/admin" className="link" style={{ justifySelf: 'start' }}>
        ← Administración
      </Link>
      <h1 className="titulo-pagina">Catálogos</h1>
      <p className="muted">
        Lo que aparece en el formulario de publicar. Las categorías no se borran: se desactivan. Una sede con lugares, o un
        lugar con publicaciones, no se puede borrar.
      </p>
      <GestionCategorias categorias={categorias} />
      <GestionSedes sedes={catalogos.sedes} />
    </>
  );
}
