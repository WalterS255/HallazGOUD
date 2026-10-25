import { evaluarToken, generarToken, hashToken } from './tokens.js';

const ahora = new Date('2026-10-25T12:00:00Z');
const HORA = 60 * 60 * 1000;

describe('generarToken', () => {
  it('genera 64 caracteres hex y guarda solo su hash', () => {
    const t = generarToken('VERIFICACION', ahora);
    expect(t.token).toMatch(/^[0-9a-f]{64}$/);
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.tokenHash).not.toBe(t.token);
    expect(t.tokenHash).toBe(hashToken(t.token));
  });

  it('cada token es distinto', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generarToken('RECUPERACION').token));
    expect(tokens.size).toBe(1000);
  });

  it('verificación vence en 24 h y recuperación en 1 h (regla 6.7)', () => {
    expect(generarToken('VERIFICACION', ahora).expiraEn.getTime() - ahora.getTime()).toBe(
      24 * HORA,
    );
    expect(generarToken('RECUPERACION', ahora).expiraEn.getTime() - ahora.getTime()).toBe(HORA);
  });

  it('el hash coincide con el que calcula PostgreSQL (encode(sha256(...), hex))', () => {
    // Mismo valor que usó docs/sql/03_soporte.sql para 'token-de-prueba-ana'.
    expect(hashToken('token-de-prueba-ana')).toBe(
      '6d9150243e94cd143c5261d232891c0a6dc1c88711fde7b24203a13a89be1e65',
    );
  });
});

describe('evaluarToken', () => {
  const vigente = { expiraEn: new Date(ahora.getTime() + HORA), usadoEn: null };

  it('vigente y sin usar → VALIDO', () => {
    expect(evaluarToken(vigente, ahora)).toBe('VALIDO');
  });

  it('ya usado → USADO, aunque no haya vencido (un solo uso)', () => {
    expect(evaluarToken({ ...vigente, usadoEn: ahora }, ahora)).toBe('USADO');
  });

  it('justo en el instante de vencer → EXPIRADO', () => {
    expect(evaluarToken({ ...vigente, expiraEn: ahora }, ahora)).toBe('EXPIRADO');
  });
});

describe('fechas del token', () => {
  it('creadoEn y expiraEn salen del mismo reloj (para el CHECK expira_en > creado_en)', () => {
    const t = generarToken('VERIFICACION', ahora);
    expect(t.creadoEn).toBe(ahora);
    expect(t.expiraEn.getTime()).toBeGreaterThan(t.creadoEn.getTime());
  });
});
