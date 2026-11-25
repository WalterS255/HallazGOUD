import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PanelEstado } from '@/components/PanelEstado';
import { diagnosticarBackend } from '@/lib/api/diagnostico';
import { puedeVerEstado } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Estado de la conexión' };

const ESTILO = {
  ok: { marca: '●', color: 'var(--ok)', etiqueta: 'correcto' },
  falla: { marca: '✕', color: 'var(--accent)', etiqueta: 'con falla' },
  info: { marca: 'i', color: 'var(--info)', etiqueta: 'información' },
};

export default async function EstadoPage() {
  // Solo administradores: a los demás, "no existe" (ni siquiera se insinúa la página).
  if (!(await puedeVerEstado())) notFound();
  const { ok, chequeos } = await diagnosticarBackend();

  return (
    <div className="stack" style={{ maxWidth: 900, width: '100%', marginInline: 'auto', gap: 32 }}>
      <div>
        <h1 className="titulo-pagina">Estado de la conexión</h1>
        <p className="muted small">
          Comprueba que el frontend llegue al backend configurado en{' '}
          <code className="mono">frontend/.env</code> y que las respuestas sean las esperadas.
        </p>
      </div>

      <section className="stack" aria-labelledby="t-backend">
        <div className="sec-head" style={{ margin: 0 }}>
          <h2 id="t-backend">Servidor del frontend → backend</h2>
          <span className={`chip ${ok ? 'chip-ENTREGADA' : 'chip-alerta'}`}>
            {ok ? 'Conectado' : 'Hay problemas'}
          </span>
        </div>
        <ul className="list">
          {chequeos.map((c) => {
            const e = ESTILO[c.estado];
            return (
              <li key={c.nombre} className="list-item" style={{ alignItems: 'flex-start' }}>
                <span
                  aria-hidden
                  style={{ color: e.color, fontWeight: 700, width: 16, textAlign: 'center' }}
                >
                  {e.marca}
                </span>
                <span className="grow">
                  <strong>
                    {c.nombre} <span className="sr-only">{e.etiqueta}</span>
                  </strong>
                  <span
                    className="small"
                    style={{ color: c.estado === 'falla' ? 'var(--accent)' : 'var(--muted)' }}
                  >
                    {c.detalle}
                  </span>
                </span>
                {c.ms !== undefined && <span className="muted small mono">{c.ms} ms</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <PanelEstado />
    </div>
  );
}
