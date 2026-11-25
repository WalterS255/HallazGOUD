import type { Metadata } from 'next';
import { AsistentePublicacion, type Prellenado } from '@/components/AsistentePublicacion';
import { apiGet, apiGetOpcional } from '@/lib/api/servidor';
import { textoLugar } from '@/lib/formato';
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

  // "¡Lo tengo!" (pregunta 13.1): solo desde un PERDIDO activo. Se copian la sede y el
  // "dónde exactamente" (o el edificio, en las publicaciones anteriores a ese campo).
  let prellenado: Prellenado | undefined;
  if (perdido && perdido.tipo === 'PERDIDO' && perdido.estado === 'ACTIVA') {
    prellenado = {
      desde: { id: perdido.id, titulo: perdido.titulo },
      titulo: perdido.titulo,
      id_categoria: perdido.categoria.id,
      id_sede: catalogos.sedes.some((s) => s.id === perdido.lugar.sede.id)
        ? perdido.lugar.sede.id
        : null,
      ubicacion: perdido.ubicacion ?? textoLugar(perdido.lugar),
    };
  }

  return <AsistentePublicacion tipoInicial={tipo} catalogos={catalogos} prellenado={prellenado} />;
}
