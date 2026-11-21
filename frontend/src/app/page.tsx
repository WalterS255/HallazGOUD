import Link from 'next/link';
import { EtiquetaHallazgo, GrillaPublicaciones } from '@/components/Publicaciones';
import { apiGet } from '@/lib/api/servidor';
import { iconoCategoria, mapaIconos } from '@/lib/formato';
import type { Catalogos, Pagina, ResumenPublicacion } from '@/lib/tipos';

const PASOS = [
  ['Se publica', 'Quien encuentra el objeto sube fotos, lugar y hora, y guarda un detalle que nadie más ve.'],
  ['Aparece la coincidencia', 'El sistema compara categoría, sede, fecha y descripción, y avisa a quien lo perdió.'],
  ['Se reclama', 'El dueño describe el detalle reservado; quien lo encontró acepta o rechaza la reclamación.'],
  ['Se entrega', 'Coordinan por el chat interno y ambos confirman. La publicación queda como entregada.'],
];

export default async function InicioPage() {
  const [encontrados, perdidos, entregados, catalogos] = await Promise.all([
    apiGet<Pagina<ResumenPublicacion>>('/publicaciones?tipo=ENCONTRADO&orden=recientes&limite=8'),
    apiGet<Pagina<ResumenPublicacion>>('/publicaciones?tipo=PERDIDO&orden=recientes&limite=4'),
    apiGet<Pagina<ResumenPublicacion>>('/publicaciones?estado=ENTREGADA&limite=1'),
    apiGet<Catalogos>('/catalogos'),
  ]);
  const iconos = mapaIconos(catalogos.categorias);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Objetos perdidos y encontrados · Universidad Distrital</p>
          <h1>Lo que se pierde en la U, en la U aparece.</h1>
          <p className="lead">
            Publica lo que encontraste o lo que perdiste en el campus. Te avisamos cuando aparezca algo parecido y
            coordinas la entrega por un chat interno, sin compartir tu correo ni tu teléfono.
          </p>
          <form action="/publicaciones" method="get" role="search" className="search">
            <label htmlFor="q-inicio" className="sr-only">
              Buscar objetos
            </label>
            <input id="q-inicio" name="q" type="search" className="field" placeholder="Calculadora, carné, chaqueta…" />
            <button className="btn btn-primary" type="submit">
              Buscar
            </button>
          </form>
          <div className="row">
            <Link href="/publicar?tipo=ENCONTRADO" className="btn btn-big btn-primary">
              Encontré algo
            </Link>
            <Link href="/publicar?tipo=PERDIDO" className="btn btn-big">
              Perdí algo
            </Link>
          </div>
        </div>
        <EtiquetaHallazgo p={encontrados.datos[0] ?? null} />
      </section>

      <section className="kpis" aria-label="Cifras">
        <Link href="/publicaciones?tipo=ENCONTRADO" className="kpi">
          <span className="muted small">Encontrados esperando a su dueño</span>
          <b>{encontrados.total}</b>
        </Link>
        <Link href="/publicaciones?tipo=PERDIDO" className="kpi">
          <span className="muted small">Reportados como perdidos</span>
          <b>{perdidos.total}</b>
        </Link>
        <Link href="/publicaciones?estado=ENTREGADA" className="kpi">
          <span className="muted small">Ya devueltos a su dueño</span>
          <b>{entregados.total}</b>
        </Link>
      </section>

      <section>
        <h2 className="mb-3">Buscar por categoría</h2>
        <div className="row">
          {catalogos.categorias.map((c) => (
            <Link key={c.id} href={`/publicaciones?id_categoria=${c.id}`} className="pill">
              <span aria-hidden>{iconoCategoria(c.icono)}</span> {c.nombre}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="sec-head">
          <h2>Encontrados recientemente</h2>
          <Link href="/publicaciones?tipo=ENCONTRADO" className="link">
            Ver todos →
          </Link>
        </div>
        <GrillaPublicaciones items={encontrados.datos} iconos={iconos} vacio="Todavía no hay objetos encontrados." />
      </section>

      <section>
        <div className="sec-head">
          <h2>Perdidos recientemente</h2>
          <Link href="/publicaciones?tipo=PERDIDO" className="link">
            Ver todos →
          </Link>
        </div>
        <p className="muted small mb-3">¿Encontraste alguno de estos? Publícalo y el sistema le avisará al dueño.</p>
        <GrillaPublicaciones items={perdidos.datos} iconos={iconos} vacio="No hay objetos perdidos reportados." />
      </section>

      <section>
        <h2 className="mb-3">Buscar por sede</h2>
        <div className="row">
          {catalogos.sedes.map((s) => (
            <Link key={s.id} href={`/publicaciones?id_sede=${s.id}`} className="pill">
              {s.nombre}
            </Link>
          ))}
        </div>
      </section>

      <section className="steps">
        <h2>Cómo se recupera un objeto</h2>
        <ol>
          {PASOS.map(([titulo, texto]) => (
            <li key={titulo}>
              <strong>{titulo}</strong>
              <span className="muted small">{texto}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
