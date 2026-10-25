import {
  type CuentaParaLogin,
  DURACION_BLOQUEO_MS,
  decidirLogin,
  type EstadoIntentos,
  estaBloqueado,
  MAX_INTENTOS,
  registrarExito,
  registrarFallo,
} from './bloqueo.js';

const t0 = new Date('2026-10-25T12:00:00Z');
const masMs = (ms: number) => new Date(t0.getTime() + ms);
const limpio: EstadoIntentos = { intentosFallidos: 0, bloqueadoHasta: null };

describe('registrarFallo', () => {
  it('los primeros 4 fallos solo cuentan; el 5.º bloquea 15 minutos', () => {
    let e = limpio;
    for (let i = 1; i < MAX_INTENTOS; i++) {
      e = registrarFallo(e, t0);
      expect(e).toEqual({ intentosFallidos: i, bloqueadoHasta: null });
    }
    e = registrarFallo(e, t0);
    expect(e.bloqueadoHasta).toEqual(masMs(DURACION_BLOQUEO_MS));
    expect(estaBloqueado(e, t0)).toBe(true);
  });

  it('el bloqueo dura exactamente 15 minutos', () => {
    const bloqueado = { intentosFallidos: 0, bloqueadoHasta: masMs(DURACION_BLOQUEO_MS) };
    expect(estaBloqueado(bloqueado, masMs(DURACION_BLOQUEO_MS - 1))).toBe(true);
    expect(estaBloqueado(bloqueado, masMs(DURACION_BLOQUEO_MS))).toBe(false);
  });

  it('tras vencer el bloqueo, un fallo cuenta como el 1.º (no vuelve a bloquear)', () => {
    const vencido = { intentosFallidos: 4, bloqueadoHasta: t0 };
    const e = registrarFallo(vencido, masMs(1));
    expect(e.intentosFallidos).toBe(1);
    expect(estaBloqueado(e, masMs(1))).toBe(false);
  });
});

describe('registrarExito', () => {
  it('reinicia el contador y quita el bloqueo', () => {
    expect(registrarExito()).toEqual(limpio);
  });
});

describe('decidirLogin (en orden)', () => {
  const activa: CuentaParaLogin = { ...limpio, verificado: true, estadoCuenta: 'ACTIVA' };
  const bloqueada = { ...activa, bloqueadoHasta: masMs(60_000) };

  it.each<[string, CuentaParaLogin | null, boolean, string]>([
    ['correo que no existe', null, false, 'CREDENCIALES_INVALIDAS'],
    [
      'cuenta eliminada (aunque la clave "coincida")',
      { ...activa, estadoCuenta: 'ELIMINADA' },
      true,
      'CREDENCIALES_INVALIDAS',
    ],
    ['contraseña incorrecta', activa, false, 'CREDENCIALES_INVALIDAS'],
    ['bloqueada con contraseña CORRECTA', bloqueada, true, 'BLOQUEADA'],
    ['bloqueada con contraseña incorrecta', bloqueada, false, 'BLOQUEADA'],
    [
      'suspendida con contraseña correcta',
      { ...activa, estadoCuenta: 'SUSPENDIDA' },
      true,
      'SUSPENDIDA',
    ],
    [
      'suspendida con contraseña incorrecta (no revela que está suspendida)',
      { ...activa, estadoCuenta: 'SUSPENDIDA' },
      false,
      'CREDENCIALES_INVALIDAS',
    ],
    [
      'sin verificar con contraseña correcta',
      { ...activa, verificado: false },
      true,
      'NO_VERIFICADA',
    ],
    ['todo en orden', activa, true, 'OK'],
  ])('%s', (_caso, cuenta, correcta, esperado) => {
    expect(decidirLogin(cuenta, correcta, t0)).toBe(esperado);
  });
});
