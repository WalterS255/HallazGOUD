import { describe, expect, it } from 'vitest';
import { MARGEN_RELOJ_MS, ajustarFechaSuceso } from './fecha-suceso.js';

const ahora = new Date('2026-11-21T15:00:00Z');
const mas = (ms: number) => new Date(ahora.getTime() + ms);

describe('ajustarFechaSuceso (reloj del celular adelantado)', () => {
  it('una fecha pasada se deja igual', () => {
    const ayer = mas(-86_400_000);
    expect(ajustarFechaSuceso(ayer, ahora)).toBe(ayer);
  });

  it('exactamente "ahora" se deja igual', () => {
    expect(ajustarFechaSuceso(ahora, ahora)).toBe(ahora);
  });

  it('3 minutos en el futuro (reloj adelantado) se toma como ahora', () => {
    expect(ajustarFechaSuceso(mas(3 * 60_000), ahora)).toBe(ahora);
  });

  it('justo en el margen todavía se acepta', () => {
    expect(ajustarFechaSuceso(mas(MARGEN_RELOJ_MS), ahora)).toBe(ahora);
  });

  it('un milisegundo más allá del margen se rechaza', () => {
    expect(ajustarFechaSuceso(mas(MARGEN_RELOJ_MS + 1), ahora)).toBeNull();
  });

  it('mañana se rechaza', () => {
    expect(ajustarFechaSuceso(mas(86_400_000), ahora)).toBeNull();
  });
});
