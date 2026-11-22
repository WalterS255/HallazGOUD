'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Prueba = { ruta: string; esperado: number[]; descripcion: string };
type Resultado = Prueba & { estado: number | null; ms: number; ok: boolean; muestra: string };

// Llamadas reales navegador → proxy del frontend → backend. Sólo lecturas: no cambian datos.
// Las marcadas "pendiente" aún no existen en el backend (ver docs/endpoints-pendientes.md).
const PRUEBAS: Prueba[] = [
  { ruta: '/api/salud', esperado: [200], descripcion: 'Servidor vivo' },
  { ruta: '/api/catalogos', esperado: [200], descripcion: 'Catálogos' },
  {
    ruta: '/api/publicaciones?limite=5',
    esperado: [200],
    descripcion: 'Catálogo de publicaciones',
  },
  {
    ruta: '/api/publicaciones?tipo=INVALIDO',
    esperado: [400],
    descripcion: 'Rechaza filtros inválidos',
  },
  { ruta: '/api/publicaciones/999999', esperado: [404], descripcion: 'Publicación inexistente' },
  {
    ruta: '/api/usuarios/me',
    esperado: [200, 401],
    descripcion: 'Perfil (200 con sesión, 401 sin)',
  },
  { ruta: '/api/notificaciones', esperado: [200, 401], descripcion: 'Notificaciones' },
  {
    ruta: '/api/admin/estadisticas',
    esperado: [200, 401, 403],
    descripcion: 'Estadísticas (sólo admin)',
  },
  {
    ruta: '/api/usuarios/me/publicaciones',
    esperado: [200, 401],
    descripcion: 'Mis publicaciones (pendiente)',
  },
  {
    ruta: '/api/usuarios/me/reclamaciones',
    esperado: [200, 401],
    descripcion: 'Mis reclamaciones (pendiente)',
  },
  {
    ruta: '/api/usuarios/me/conversaciones',
    esperado: [200, 401],
    descripcion: 'Mis conversaciones (pendiente)',
  },
];

export function PanelEstado() {
  const router = useRouter();
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [corriendo, setCorriendo] = useState(false);

  const ejecutar = useCallback(async () => {
    setCorriendo(true);
    const salida: Resultado[] = [];
    for (const p of PRUEBAS) {
      const inicio = performance.now();
      try {
        const r = await fetch(p.ruta, { cache: 'no-store' });
        const texto = await r.text();
        salida.push({
          ...p,
          estado: r.status,
          ms: Math.round(performance.now() - inicio),
          ok: p.esperado.includes(r.status),
          muestra: texto.slice(0, 200),
        });
      } catch (e) {
        salida.push({
          ...p,
          estado: null,
          ms: Math.round(performance.now() - inicio),
          ok: false,
          muestra: e instanceof Error ? e.message : 'Error de red',
        });
      }
    }
    setResultados(salida);
    setCorriendo(false);
  }, []);

  useEffect(() => {
    // Al abrir la página se lanzan las pruebas contra el backend: es sincronizar con un sistema externo.
    // eslint-disable-next-line react/set-state-in-effect
    ejecutar();
  }, [ejecutar]);

  const fallidas = resultados.filter((r) => !r.ok).length;

  return (
    <section className="stack" aria-labelledby="t-api">
      <div className="sec-head" style={{ margin: 0 }}>
        <h2 id="t-api">Navegador → frontend → backend</h2>
        <button
          type="button"
          className="btn"
          disabled={corriendo}
          onClick={() => (router.refresh(), ejecutar())}
        >
          {corriendo ? 'Probando…' : 'Volver a probar'}
        </button>
      </div>
      {resultados.length > 0 && (
        <p className="muted small" aria-live="polite">
          {resultados.length - fallidas} de {resultados.length} respuestas fueron las esperadas.
          Pasa el cursor sobre un código para ver el inicio de la respuesta.
        </p>
      )}
      <div className="scroll-x">
        <table className="tabla">
          <thead>
            <tr>
              <th>Prueba</th>
              <th>Petición</th>
              <th>Esperado</th>
              <th>Obtenido</th>
              <th style={{ textAlign: 'right' }}>Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r) => (
              <tr key={r.ruta}>
                <td>{r.descripcion}</td>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                  GET {r.ruta}
                </td>
                <td className="mono">{r.esperado.join(' o ')}</td>
                <td
                  className="mono"
                  style={{ color: r.ok ? 'var(--ok)' : 'var(--accent)', fontWeight: 700 }}
                  title={r.muestra}
                >
                  {r.estado ?? 'sin respuesta'}
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  {r.ms} ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
