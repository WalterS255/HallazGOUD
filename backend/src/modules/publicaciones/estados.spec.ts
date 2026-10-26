import {
  ESTADOS_FINALES,
  type EstadoPublicacion,
  esEditable,
  esTransicionValida,
} from './estados.js';

const TODOS: EstadoPublicacion[] = [
  'ACTIVA',
  'EN_RECLAMACION',
  'ENTREGADA',
  'EXPIRADA',
  'RETIRADA',
];

// Las transiciones válidas, escritas aparte a propósito: si alguien cambia la
// tabla TRANSICIONES sin querer, esta prueba lo detecta.
const VALIDAS = new Set([
  'ACTIVA→EN_RECLAMACION',
  'ACTIVA→EXPIRADA',
  'ACTIVA→RETIRADA',
  'EN_RECLAMACION→ENTREGADA',
  'EN_RECLAMACION→ACTIVA',
]);

describe('máquina de estados de una publicación', () => {
  // Recorre las 25 combinaciones posibles: así no se escapa ninguna.
  for (const desde of TODOS) {
    for (const hacia of TODOS) {
      const clave = `${desde}→${hacia}`;
      const esperado = VALIDAS.has(clave);
      it(`${clave} ${esperado ? 'se permite' : 'se rechaza'}`, () => {
        expect(esTransicionValida(desde, hacia)).toBe(esperado);
      });
    }
  }

  it('los estados finales no tienen salida', () => {
    for (const final of ESTADOS_FINALES) {
      expect(TODOS.some((hacia) => esTransicionValida(final, hacia))).toBe(false);
    }
  });

  it('solo ACTIVA y EN_RECLAMACION se pueden editar (RF-10)', () => {
    expect(TODOS.filter(esEditable)).toEqual(['ACTIVA', 'EN_RECLAMACION']);
  });
});
