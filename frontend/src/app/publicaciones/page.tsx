import type { Metadata } from 'next';
import Link from 'next/link';
import { GrillaPublicaciones } from '@/components/Publicaciones';
import { apiGet } from '@/lib/api/servidor';
import { ETIQUETA_ESTADO, iconoCategoria, mapaIconos } from '@/lib/formato';
import { aObjetoPlano, type ParamsBusqueda } from '@/lib/params';
import type { Catalogos, Pagina, ResumenPublicacion } from '@/lib/tipos';
import { ESTADOS_FILTRO, filtrosSchema, type Filtros } from '@/lib/validators';

export const metadata: Metadata = { title: 'Catálogo' };

const POR_PAGINA = 12;

function aQuery(filtros: Filtros, pagina?: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros))
    if (v !== undefined && k !== 'pagina') sp.set(k, String(v));
  if (pagina && pagina > 1) sp.set('pagina', String(pagina));
  return sp.toString();
}

export default async function CatalogoPage({ searchParams }: { searchParams: ParamsBusqueda }) {
  const analisis = filtrosSchema.safeParse(aObjetoPlano(await searchParams));
  const f: Filtros = analisis.success ? analisis.data : {};
  const pagina = f.pagina ?? 1;

  const [resultado, catalogos] = await Promise.all([
    apiGet<Pagina<ResumenPublicacion>>(
      `/publicaciones?${aQuery(f)}&pagina=${pagina}&limite=${POR_PAGINA}`,
    ),
    apiGet<Catalogos>('/catalogos'),
  ]);
  const paginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA));
  const tipo = (valor: string, texto: string) => (
    <label>
      <input type="radio" name="tipo" value={valor} defaultChecked={(f.tipo ?? '') === valor} />
      <span>{texto}</span>
    </label>
  );

  return (
    <>
      <div className="sec-head" style={{ margin: 0 }}>
        <div>
          <h1 className="titulo-pagina">Catálogo</h1>
          <p className="muted small" aria-live="polite">
            {resultado.total} resultado{resultado.total === 1 ? '' : 's'}
          </p>
        </div>
        <Link href="/publicar" className="btn btn-primary">
          Publicar
        </Link>
      </div>

      {!analisis.success && (
        <p className="note note-info">Algunos filtros no eran válidos y se ignoraron.</p>
      )}

      <div className="cat-layout">
        <form method="get" className="panel filters" aria-label="Filtros">
          <div>
            <label className="label" htmlFor="f-q">
              Palabras clave
            </label>
            <input
              id="f-q"
              name="q"
              type="search"
              className="field"
              defaultValue={f.q}
              placeholder="Ej.: casio"
            />
          </div>
          <fieldset>
            <legend className="label">Tipo</legend>
            <div className="seg">
              {tipo('', 'Todos')}
              {tipo('ENCONTRADO', 'Encontrados')}
              {tipo('PERDIDO', 'Perdidos')}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="f-cat">
              Categoría
            </label>
            <select
              id="f-cat"
              name="id_categoria"
              className="field"
              defaultValue={f.id_categoria ?? ''}
            >
              <option value="">Todas</option>
              {catalogos.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {iconoCategoria(c.icono)} {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-sede">
              Sede
            </label>
            <select id="f-sede" name="id_sede" className="field" defaultValue={f.id_sede ?? ''}>
              <option value="">Todas</option>
              {catalogos.sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="two">
            <div>
              <label className="label" htmlFor="f-desde">
                Desde
              </label>
              <input
                id="f-desde"
                name="desde"
                type="date"
                className="field"
                defaultValue={f.desde}
              />
            </div>
            <div>
              <label className="label" htmlFor="f-hasta">
                Hasta
              </label>
              <input
                id="f-hasta"
                name="hasta"
                type="date"
                className="field"
                defaultValue={f.hasta}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="f-estado">
              Estado
            </label>
            <select id="f-estado" name="estado" className="field" defaultValue={f.estado ?? ''}>
              <option value="">Activas</option>
              {ESTADOS_FILTRO.filter((e) => e !== 'ACTIVA').map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-orden">
              Ordenar por
            </label>
            <select id="f-orden" name="orden" className="field" defaultValue={f.orden ?? ''}>
              <option value="">Automático (relevancia si buscas texto)</option>
              <option value="recientes">Más recientes</option>
              <option value="antiguos">Más antiguos</option>
              <option value="relevancia">Mayor relevancia</option>
            </select>
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              Aplicar
            </button>
            <Link href="/publicaciones" className="btn">
              Limpiar
            </Link>
          </div>
        </form>

        <section className="stack">
          <GrillaPublicaciones items={resultado.datos} iconos={mapaIconos(catalogos.categorias)} />
          {paginas > 1 && (
            <nav aria-label="Paginación" className="paginacion">
              {pagina > 1 && (
                <Link href={`/publicaciones?${aQuery(f, pagina - 1)}`} className="btn">
                  ← Anterior
                </Link>
              )}
              <span>
                Página {pagina} de {paginas}
              </span>
              {pagina < paginas && (
                <Link href={`/publicaciones?${aQuery(f, pagina + 1)}`} className="btn">
                  Siguiente →
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
