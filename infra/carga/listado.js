// Prueba de carga del catálogo con k6 (Fase J · RNF-01):
// "listado filtrado en menos de 2 s con 10.000 publicaciones y 200 usuarios".
//
// Corre en Docker (ver infra/carga/README.md). Cada usuario virtual hace lo que haría un
// estudiante: abre el catálogo, filtra, busca, pasa de página o abre una ficha, y piensa
// entre 1 y 3 segundos antes del siguiente clic.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE ?? 'http://host.docker.internal:3100/api';

export const options = {
  scenarios: {
    estudiantes: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 200 }, // llegan de a poco
        { duration: '1m', target: 200 }, // 200 a la vez durante un minuto
        { duration: '15s', target: 0 }, // se van
      ],
    },
  },
  // Si alguna de estas no se cumple, k6 termina con error (y lo dice en el resumen).
  thresholds: {
    'http_req_duration{tipo:listado}': ['p(95)<2000'], // RNF-01
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'], // menos del 1 % de errores
    checks: ['rate>0.99'],
  },
};

const azar = (n) => 1 + Math.floor(Math.random() * n);
const PALABRAS = ['calculadora', 'audífonos negros', 'llaves', 'sombrilla azul', 'cuaderno', 'termo gris'];

function pedir(ruta, nombre) {
  const r = http.get(`${BASE}${ruta}`, { tags: { tipo: 'listado', consulta: nombre } });
  check(r, {
    'responde 200': (x) => x.status === 200,
    'trae datos': (x) => Array.isArray(x.json('datos')),
  });
  return r;
}

export default function () {
  const accion = Math.random();
  if (accion < 0.3) {
    pedir('/publicaciones', 'catalogo');
  } else if (accion < 0.55) {
    pedir(`/publicaciones?tipo=ENCONTRADO&id_categoria=${azar(8)}&id_sede=${azar(8)}`, 'filtros');
  } else if (accion < 0.75) {
    const q = encodeURIComponent(PALABRAS[azar(PALABRAS.length) - 1]);
    pedir(`/publicaciones?q=${q}&orden=relevancia`, 'busqueda');
  } else if (accion < 0.9) {
    pedir(`/publicaciones?pagina=${azar(20)}&orden=antiguos`, 'paginas');
  } else {
    const lista = pedir('/publicaciones?limite=20', 'catalogo');
    const ids = lista.json('datos.#.id') ?? [];
    if (ids.length) {
      const r = http.get(`${BASE}/publicaciones/${ids[azar(ids.length) - 1]}`, {
        tags: { tipo: 'ficha', consulta: 'ficha' },
      });
      check(r, { 'ficha 200': (x) => x.status === 200 });
    }
  }
  sleep(1 + Math.random() * 2);
}
