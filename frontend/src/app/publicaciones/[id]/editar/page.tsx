import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FormEditarPublicacion,
  type ValoresEdicion,
} from '@/components/publicacion/FormEditarPublicacion';
import { apiGet, apiGetOpcional } from '@/lib/api/servidor';
import { aFechaYHoraColombia, textoLugar } from '@/lib/formato';
import { usuarioOLogin } from '@/lib/sesion';
import type { Catalogos, Publicacion, ReclamacionesDePublicacion } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Editar publicación' };

type Props = { params: Promise<{ id: string }> };

// RF-10: el autor edita mientras la publicación no esté entregada, expirada ni retirada.
// La regla la decide el backend (PUT /publicaciones/:id); aquí solo se evita mostrar
// un formulario que de todas formas sería rechazado.
export default async function EditarPublicacionPage({ params }: Props) {
  const { id } = await params;
  const yo = await usuarioOLogin(`/publicaciones/${id}/editar`);
  const [p, catalogos] = await Promise.all([
    apiGetOpcional<Publicacion>(`/publicaciones/${encodeURIComponent(id)}`),
    apiGet<Catalogos>('/catalogos'),
  ]);

  const aviso = (texto: string) => (
    <div className="stack" style={{ maxWidth: 760, width: '100%', marginInline: 'auto' }}>
      <p className="note note-err">{texto}</p>
      <Link href={p ? `/publicaciones/${p.id}` : '/publicaciones'} className="link">
        ← Volver
      </Link>
    </div>
  );
  if (!p || p.usuario.id !== yo.id)
    return aviso('Solo quien publicó puede editar esta publicación.');
  if (p.estado !== 'ACTIVA' && p.estado !== 'EN_RECLAMACION') {
    return aviso('Esta publicación ya no se puede editar (está entregada, expirada o retirada).');
  }

  const esHallazgo = p.tipo === 'ENCONTRADO';
  // Solo el autor recibe el detalle reservado y las reclamaciones (regla 6.3).
  const reservado = esHallazgo
    ? await apiGet<ReclamacionesDePublicacion>(`/publicaciones/${p.id}/reclamaciones`)
    : null;
  const { fecha, hora } = aFechaYHoraColombia(p.fecha_suceso);
  const iniciales: ValoresEdicion = {
    titulo: p.titulo,
    id_categoria: String(p.categoria.id),
    descripcion: p.descripcion,
    id_sede: String(p.lugar.sede.id),
    // Las publicaciones anteriores al campo "dónde exactamente" muestran su edificio.
    ubicacion: p.ubicacion ?? textoLugar(p.lugar),
    fecha,
    hora,
    detalle_reservado: reservado?.detalle_reservado ?? '',
    pista: p.pista ?? '',
  };

  return (
    <section className="stack" style={{ maxWidth: 760, width: '100%', marginInline: 'auto' }}>
      <Link href={`/publicaciones/${p.id}`} className="link" style={{ justifySelf: 'start' }}>
        ← Volver a la publicación
      </Link>
      <h1 className="titulo-pagina">Editar publicación</h1>
      <FormEditarPublicacion
        publicacionId={p.id}
        esHallazgo={esHallazgo}
        detalleBloqueado={(reservado?.reclamaciones.length ?? 0) > 0}
        iniciales={iniciales}
        catalogos={catalogos}
      />
    </section>
  );
}
