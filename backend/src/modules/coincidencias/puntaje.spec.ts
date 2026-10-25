import { calcularPuntaje, type DatosCoincidencia, ordenarCoincidencias } from './puntaje.js';

const DIA = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-10-15T12:00:00Z');
const masDias = (d: number) => new Date(t0.getTime() + d * DIA);
const r1 = (n: number) => Math.round(n * 10) / 10;

// El PERDIDO "Calculadora Casio fx-570 perdida" de docs/sql/04_coincidencias.sql,
// con los mismos lexemas que mostró PostgreSQL en 04b_comparar_similitud.sql.
const perdido: DatosCoincidencia = {
  idCategoria: 5,
  idSede: 1,
  fechaSuceso: t0,
  palabras: [
    '-570',
    'bibliotec',
    'calcul',
    'casi',
    'cientif',
    'dej',
    'fx',
    'gris',
    'negr',
    'perd',
    'tap',
  ],
};

describe('calcularPuntaje: mismos números que la consulta SQL (04_coincidencias.sql)', () => {
  it.each<[string, DatosCoincidencia, number]>([
    [
      'mismo día, misma categoría y sede',
      {
        idCategoria: 5,
        idSede: 1,
        fechaSuceso: t0,
        palabras: ['bibliotec', 'calcul', 'casi', 'cientif', 'encontr', 'gris', 'mes'],
      },
      89.1,
    ],
    [
      'exactamente 7 días después',
      {
        idCategoria: 5,
        idSede: 1,
        fechaSuceso: masDias(7),
        palabras: ['calcul', 'gris', 'olvid', 'parcial', 'salon', '305'],
      },
      58.6,
    ],
    [
      'otra sede, 3 días antes',
      {
        idCategoria: 5,
        idSede: 2,
        fechaSuceso: masDias(-3),
        palabras: ['cafeteri', 'calcul', 'cientif', 'tap'],
      },
      54.7,
    ],
    [
      'otra categoría, 1 día después',
      {
        idCategoria: 1,
        idSede: 1,
        fechaSuceso: masDias(1),
        palabras: ['calcul', 'encontr', 'grafic', 'pasill'],
      },
      43.2,
    ],
  ])('%s → %s', (_caso, encontrado, esperado) => {
    expect(r1(calcularPuntaje(perdido, encontrado).total)).toBe(esperado);
  });
});

describe('calcularPuntaje: casos límite de tiempo (día 0, 7 y 8)', () => {
  const sinTexto = (dias: number): DatosCoincidencia => ({
    idCategoria: 5,
    idSede: 1,
    fechaSuceso: masDias(dias),
    palabras: [],
  });

  it('día 0 → 25 puntos de tiempo', () => {
    expect(calcularPuntaje(perdido, sinTexto(0)).tiempo).toBe(25);
  });
  it('día 7 → 0 puntos de tiempo (pero sigue en la ventana)', () => {
    expect(calcularPuntaje(perdido, sinTexto(7)).tiempo).toBe(0);
  });
  it('día 8 → 0 puntos de tiempo (no negativo)', () => {
    expect(calcularPuntaje(perdido, sinTexto(8)).tiempo).toBe(0);
  });
  it('es simétrico: 3 días antes vale lo mismo que 3 días después', () => {
    expect(calcularPuntaje(perdido, sinTexto(-3)).tiempo).toBe(
      calcularPuntaje(perdido, sinTexto(3)).tiempo,
    );
  });
});

describe('calcularPuntaje: texto', () => {
  it('un perdido sin palabras no divide por cero', () => {
    const vacio = { ...perdido, palabras: [] };
    expect(calcularPuntaje(vacio, perdido).texto).toBe(0);
  });
  it('todas las palabras en común → 20 puntos', () => {
    expect(calcularPuntaje(perdido, perdido).texto).toBe(20);
  });
});

describe('ordenarCoincidencias', () => {
  it('deja solo los que pasan de 50 y los ordena de mayor a menor', () => {
    const candidatos = [
      {
        id: 'otra-categoria',
        idCategoria: 1,
        idSede: 1,
        fechaSuceso: masDias(1),
        palabras: ['calcul'],
      },
      {
        id: 'a-7-dias',
        idCategoria: 5,
        idSede: 1,
        fechaSuceso: masDias(7),
        palabras: ['calcul', 'gris'],
      },
      { id: 'mismo-dia', idCategoria: 5, idSede: 1, fechaSuceso: t0, palabras: ['calcul', 'casi'] },
    ];
    const r = ordenarCoincidencias(perdido, candidatos);
    expect(r.map((c) => c.candidato.id)).toEqual(['mismo-dia', 'a-7-dias']);
  });
  it('exactamente 50 NO se muestra (el umbral es "> 50")', () => {
    // categoría (35) + nada de sede + 15 de tiempo (día 2.8) = 50
    const justo50 = { idCategoria: 5, idSede: 9, fechaSuceso: masDias(2.8), palabras: [] };
    expect(r1(calcularPuntaje(perdido, justo50).total)).toBe(50);
    expect(ordenarCoincidencias(perdido, [justo50])).toEqual([]);
  });
});
