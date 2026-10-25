import { calcularPuntaje, type DatosCoincidencia, seMuestra } from './puntaje.js';

const DIA = 86_400_000;
const base = new Date('2026-10-01T15:00:00Z');

// Referencia: un PERDIDO de calculadora (mismos lexemas que en docs/sql/04_coincidencias.sql).
const ref: DatosCoincidencia = {
  id_categoria: 5,
  id_sede: 1,
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

  it('otra sede pierde los 20 puntos (edificio análogo: pendiente 13.2)', () => {
    expect(calcularPuntaje(ref, cand({ id_sede: 2 })).sede).toBe(0);
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
