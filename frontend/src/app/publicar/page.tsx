import type { Metadata } from 'next';
import { AsistentePublicacion } from '@/components/AsistentePublicacion';
import { apiGet } from '@/lib/api/servidor';
import { unico, type ParamsBusqueda } from '@/lib/params';
import { usuarioOLogin } from '@/lib/sesion';
import type { Catalogos } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Publicar' };

export default async function PublicarPage({ searchParams }: { searchParams: ParamsBusqueda }) {
  const tipo = unico((await searchParams).tipo) === 'PERDIDO' ? 'PERDIDO' : 'ENCONTRADO';
  await usuarioOLogin(`/publicar?tipo=${tipo}`);
  const catalogos = await apiGet<Catalogos>('/catalogos');
  return <AsistentePublicacion tipoInicial={tipo} catalogos={catalogos} />;
}
