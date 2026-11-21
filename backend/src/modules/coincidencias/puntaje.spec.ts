import { calcularPuntaje, type DatosCoincidencia, esAnalogo, seMuestra } from './puntaje.js';

const DIA = 86_400_000;
const base = new Date('2026-10-01T15:00:00Z');

// Referencia: un PERDIDO de calculadora (mismos lexemas que en docs/sql/04_coincidencias.sql).
const ref: DatosCoincidencia = {
  id_categoria: 5,
  id_sede: 1,
  tipo_lugar: 'BIBLIOTECA',
  fecha_suceso: base,
  palabras: ['calcul', 'casi', 'cientif', 'gris', 'bibliotec'],
};
const cand = (cambios: Partial<DatosCoincidencia>): DatosCoincidencia => ({ ...ref, ...cambios });
const enDias = (d: number) => new Date(base.getTime() + d * DIA);

describe('calcularPuntaje', () => {
  it('candidato idéntico el mismo día = 100', () => {
    expect(calcularPuntaje(ref, cand({}))).toEqual({
      categoria: 35,
      sede: 20,
      tiempo: 25,
      texto: 20,
      total: 100,
    });
  });

  describe('proximidad temporal (casos límite)', () => {
    it('día 0 → 25 puntos', () => {
      expect(calcularPuntaje(ref, cand({ fecha_suceso: enDias(0) })).tiempo).toBe(25);
    });
    it('día 7 → 0 puntos (borde de la ventana)', () => {
      expect(calcularPuntaje(ref, cand({ fecha_suceso: enDias(7) })).tiempo).toBe(0);
    });
    it('día 8 → 0 puntos, nunca negativo', () => {
      expect(calcularPuntaje(ref, cand({ fecha_suceso: enDias(8) })).tiempo).toBe(0);
    });
    it('cuenta igual antes que después (3 días antes = 3 días después)', () => {
      const antes = calcularPuntaje(ref, cand({ fecha_suceso: enDias(-3) })).tiempo;
      const despues = calcularPuntaje(ref, cand({ fecha_suceso: enDias(3) })).tiempo;
      expect(antes).toBe(despues);
      expect(antes).toBeCloseTo(14.3, 1); // 25 × (1 − 3/7)
    });
  });

  it('otra categoría pierde los 35 puntos', () => {
    expect(calcularPuntaje(ref, cand({ id_categoria: 9 })).categoria).toBe(0);
  });

  it('otra sede y otra clase de lugar pierde los 20 puntos', () => {
    expect(calcularPuntaje(ref, cand({ id_sede: 2, tipo_lugar: 'CAFETERIA' })).sede).toBe(0);
  });

  it('otra sede pero "edificio análogo" (biblioteca con biblioteca) = 10 de 20 (13.2)', () => {
    expect(calcularPuntaje(ref, cand({ id_sede: 2, tipo_lugar: 'BIBLIOTECA' })).sede).toBe(10);
  });

  it('OTRO o sin clasificar nunca cuenta como análogo', () => {
    expect(esAnalogo('OTRO', 'OTRO')).toBe(false);
    expect(esAnalogo(null, null)).toBe(false);
    expect(esAnalogo('BIBLIOTECA', null)).toBe(false);
    expect(
      calcularPuntaje({ ...ref, tipo_lugar: null }, cand({ id_sede: 2, tipo_lugar: null })).sede,
    ).toBe(0);
  });

  it('en la misma sede el tipo de lugar no importa: 20', () => {
    expect(calcularPuntaje(ref, cand({ tipo_lugar: 'CAFETERIA' })).sede).toBe(20);
  });

  it('texto = porcentaje de palabras de la referencia que aparecen en el candidato', () => {
    // 2 de 5 palabras → 20 × 2/5 = 8
    expect(calcularPuntaje(ref, cand({ palabras: ['calcul', 'gris', 'azul'] })).texto).toBe(8);
  });

  it('referencia sin palabras → texto 0 (no divide por cero)', () => {
    expect(calcularPuntaje(cand({ palabras: [] }), cand({})).texto).toBe(0);
  });

  describe('umbral de 50', () => {
    it('misma categoría y sede a 7 días sin texto en común = 55 → se muestra', () => {
      const d = calcularPuntaje(ref, cand({ fecha_suceso: enDias(7), palabras: [] }));
      expect(d.total).toBe(55);
      expect(seMuestra(d)).toBe(true);
    });
    it('otra categoría, misma sede, al día siguiente y poco texto → no se muestra', () => {
      const d = calcularPuntaje(
        ref,
        cand({ id_categoria: 9, fecha_suceso: enDias(1), palabras: ['calcul'] }),
      );
      expect(d.total).toBeCloseTo(45.4, 1); // 0 + 20 + 21.4 + 4
      expect(seMuestra(d)).toBe(false);
    });
    it('exactamente 50 no se muestra (debe ser MAYOR que 50)', () => {
      expect(seMuestra({ categoria: 0, sede: 0, tiempo: 0, texto: 0, total: 50 })).toBe(false);
    });
  });
});

// Paridad con la práctica de la Fase A: los mismos casos de docs/sql/04_coincidencias.sql
// (lexemas tomados de la salida de 04b_comparar_similitud.sql) deben dar los mismos totales.
// Si el SQL y el código dejan de coincidir, alguno de los dos cambió la fórmula.
describe('paridad con docs/sql/04_coincidencias.sql', () => {
  // La práctica en SQL no tiene clase de lugar: tipo_lugar null en los dos lados.
  const refSql: DatosCoincidencia = {
    id_categoria: 5,
    id_sede: 1,
    tipo_lugar: null,
    fecha_suceso: base,
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
  it.each([
    [
      'mismo día, misma sede',
      {
        id_categoria: 5,
        id_sede: 1,
        dias: 0,
        palabras: ['bibliotec', 'calcul', 'casi', 'cientif', 'encontr', 'gris', 'mes'],
      },
      89.1,
    ],
    [
      'exactamente 7 días',
      {
        id_categoria: 5,
        id_sede: 1,
        dias: 7,
        palabras: ['calcul', 'gris', 'olvid', 'parcial', 'salon', '305'],
      },
      58.6,
    ],
    [
      'otra sede, 3 días antes',
      { id_categoria: 5, id_sede: 2, dias: -3, palabras: ['cafeteri', 'calcul', 'cientif', 'tap'] },
      54.7,
    ],
    [
      'otra categoría',
      { id_categoria: 1, id_sede: 1, dias: 1, palabras: ['calcul', 'encontr', 'grafic', 'pasill'] },
      43.2,
    ],
  ])('%s → %d', (_nombre, c, total) => {
    const cand = { ...c, tipo_lugar: null, fecha_suceso: enDias(c.dias) };
    expect(calcularPuntaje(refSql, cand).total).toBe(total);
  });
});
