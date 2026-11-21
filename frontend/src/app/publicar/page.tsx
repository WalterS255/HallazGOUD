import type { Metadata } from 'next';
import { AsistentePublicacion, type Prellenado } from '@/components/AsistentePublicacion';
import { apiGet, apiGetOpcional } from '@/lib/api/servidor';
import { unico, type ParamsBusqueda } from '@/lib/params';
import { usuarioOLogin } from '@/lib/sesion';
import type { Catalogos, Publicacion } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Publicar' };

export default async function PublicarPage({ searchParams }: { searchParams: ParamsBusqueda }) {
  const params = await searchParams;
  const loTengo = Number(unico(params.lo_tengo)) || null;
  const tipo = loTengo ? 'ENCONTRADO' : unico(params.tipo) === 'PERDIDO' ? 'PERDIDO' : 'ENCONTRADO';
  await usuarioOLogin(loTengo ? `/publicar?lo_tengo=${loTengo}` : `/publicar?tipo=${tipo}`);
  const [catalogos, perdido] = await Promise.all([
    apiGet<Catalogos>('/catalogos'),
    loTengo ? apiGetOpcional<Publicacion>(`/publicaciones/${loTengo}`) : null,
  ]);

  // "¡Lo tengo!" (pregunta 13.1): solo desde un PERDIDO activo. La ficha trae el lugar
  // como texto (sede + edificio); su id se busca en los catálogos.
  let prellenado: Prellenado | undefined;
  if (perdido && perdido.tipo === 'PERDIDO' && perdido.estado === 'ACTIVA') {
    const sede = catalogos.sedes.find((s) => s.id === perdido.lugar.sede.id);
    const lugar = sede?.lugares.find((l) => l.edificio === perdido.lugar.edificio);
    prellenado = {
      desde: { id: perdido.id, titulo: perdido.titulo },
      titulo: perdido.titulo,
      id_categoria: perdido.categoria.id,
      id_lugar: lugar?.id ?? null,
    };
  }

  return <AsistentePublicacion tipoInicial={tipo} catalogos={catalogos} prellenado={prellenado} />;
}
