import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccionesModeracion } from '@/components/admin/AccionesModeracion';
import { apiGet } from '@/lib/api/servidor';
import { formatearFechaHora } from '@/lib/formato';
import { esModerador, usuarioOLogin } from '@/lib/sesion';
import type { Estadisticas, ReporteModeracion } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Administración' };

function Barras({ titulo, filas }: { titulo: string; filas: { nombre: string; total: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <div className="panel stack">
      <h3>{titulo}</h3>
      {filas.length === 0 ? (
        <p className="muted small">Sin datos en el periodo.</p>
      ) : (
        <div className="bars">
          {filas.map((f) => (
            <div key={f.nombre} className="bar-row">
              <div>
                <span>{f.nombre}</span>
                <strong className="mono">{f.total}</strong>
              </div>
              <span className="bar">
                <span style={{ width: `${(f.total / max) * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function AdminPage() {
  const usuario = await usuarioOLogin('/admin');
  if (!esModerador(usuario.rol)) redirect('/');
  const esAdmin = usuario.rol === 'ADMIN';

  // Las estadísticas son sólo para ADMIN; la moderación, para MODERADOR y ADMIN (api.md §13).
  const [est, reportes] = await Promise.all([
    esAdmin ? apiGet<Estadisticas>('/admin/estadisticas') : null,
    apiGet<ReporteModeracion[]>('/admin/reportes'),
  ]);

  return (
    <>
      <h1 className="titulo-pagina">Administración</h1>
      {esAdmin && (
        <nav className="row" style={{ gap: 8 }} aria-label="Gestión">
          <Link href="/admin/catalogos" className="btn">
            Catálogos: categorías, sedes y lugares
          </Link>
          <Link href="/admin/cuentas" className="btn">
            Cuentas: suspender o reactivar
          </Link>
        </nav>
      )}

      {est && (
        <>
          <section className="kpis" aria-label="Indicadores de los últimos 12 meses">
            <div className="kpi">
              <span className="muted small">Encontrados</span>
              <b>{est.recuperacion.encontrados}</b>
            </div>
            <div className="kpi">
              <span className="muted small">Entregados</span>
              <b>{est.recuperacion.entregados}</b>
            </div>
            <div className="kpi">
              <span className="muted small">Tasa de recuperación</span>
              <b>{est.recuperacion.tasa === null ? '—' : `${Math.round(est.recuperacion.tasa * 100)} %`}</b>
              <span className="muted small">Meta del semestre: ≥ 35 %</span>
            </div>
            <div className="kpi">
              <span className="muted small">Reportes pendientes</span>
              <b>{reportes.length}</b>
            </div>
          </section>
          <section className="cols3">
            <Barras titulo="Publicaciones por mes" filas={est.por_mes.map((m) => ({ nombre: m.mes, total: m.perdidos + m.encontrados }))} />
            <Barras titulo="Categorías más frecuentes" filas={est.categorias_frecuentes} />
            <Barras titulo="Lugares críticos (pérdidas)" filas={est.lugares_criticos} />
          </section>
        </>
      )}

      <section className="stack">
        <h2>Reportes pendientes ({reportes.length})</h2>
        {reportes.length === 0 ? (
          <p className="empty">No hay reportes pendientes.</p>
        ) : (
          reportes.map((r) => (
            <div key={r.id} className="panel stack">
              <div className="claim-head">
                <Link href={`/publicaciones/${r.publicacion.id}`} className="link">
                  {r.publicacion.titulo}
                </Link>
                <span className="muted">
                  {r.reportante.nombre} · {formatearFechaHora(r.fecha)}{' '}
                  {r.vencido && <span className="chip chip-alerta">Vencido: {r.horas_pendiente} h</span>}
                </span>
              </div>
              <p>
                <strong>Motivo:</strong> {r.motivo}
              </p>
              <AccionesModeracion reporteId={r.id} />
            </div>
          ))
        )}
      </section>
    </>
  );
}
