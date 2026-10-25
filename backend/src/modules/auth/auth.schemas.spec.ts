import { esquemaLogin, esquemaRegistro, esquemaRestablecer } from './auth.schemas.js';

const registroValido = {
  nombre: 'Ana Pérez',
  correo: 'aperez@udistrital.edu.co',
  programa: 'Ingeniería de Sistemas',
  contrasena: 'clave1234',
  aceptaPolitica: true,
};

// Mensajes de error de un intento, por campo: { correo: '...', contrasena: '...' }.
function errores(esquema: typeof esquemaRegistro, datos: unknown) {
  const r = esquema.safeParse(datos);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((p) => [p.path.join('.'), p.message]));
}

describe('esquemaRegistro', () => {
  it('acepta un registro válido y normaliza el correo', () => {
    const r = esquemaRegistro.parse({ ...registroValido, correo: '  APerez@UDistrital.edu.co ' });
    expect(r.correo).toBe('aperez@udistrital.edu.co');
  });

  it('rechaza correos de otros dominios (RF-01)', () => {
    expect(errores(esquemaRegistro, { ...registroValido, correo: 'ana@gmail.com' })).toEqual({
      correo: 'Usa tu correo institucional @udistrital.edu.co',
    });
  });

  it('rechaza un dominio "parecido" (udistrital.edu.co.fake.com)', () => {
    const r = errores(esquemaRegistro, {
      ...registroValido,
      correo: 'x@udistrital.edu.co.fake.com',
    });
    expect(r.correo).toBeDefined();
  });

  it('exige aceptar la política de datos (Ley 1581)', () => {
    expect(errores(esquemaRegistro, { ...registroValido, aceptaPolitica: false })).toEqual({
      aceptaPolitica: 'Debes aceptar la política de tratamiento de datos',
    });
    // "true" como texto tampoco vale: tiene que ser el valor booleano true.
    expect(
      errores(esquemaRegistro, { ...registroValido, aceptaPolitica: 'true' }).aceptaPolitica,
    ).toBeDefined();
  });

  it.each([
    ['corta', 'abc12', 'al menos 8 caracteres'],
    ['sin números', 'solamenteletras', 'una letra y un número'],
    ['sin letras', '1234567890', 'una letra y un número'],
  ])('rechaza una contraseña %s', (_caso, contrasena, mensaje) => {
    expect(errores(esquemaRegistro, { ...registroValido, contrasena }).contrasena).toContain(
      mensaje,
    );
  });

  it('cuenta BYTES para el límite de bcrypt: 40 "ñ" = 80 bytes → demasiado larga', () => {
    const contrasena = 'ñ'.repeat(40) + '1';
    expect(contrasena.length).toBeLessThan(72);
    expect(errores(esquemaRegistro, { ...registroValido, contrasena }).contrasena).toBe(
      'La contraseña es demasiado larga',
    );
  });
});

describe('esquemaLogin', () => {
  it('no exige la política de contraseñas (las cuentas viejas deben poder entrar)', () => {
    expect(esquemaLogin.safeParse({ correo: 'a@udistrital.edu.co', contrasena: 'x' }).success).toBe(
      true,
    );
  });
});

describe('esquemaRestablecer', () => {
  it('solo acepta tokens de 64 caracteres hexadecimales', () => {
    const base = { contrasena: 'nueva1234' };
    expect(esquemaRestablecer.safeParse({ ...base, token: 'a'.repeat(64) }).success).toBe(true);
    expect(esquemaRestablecer.safeParse({ ...base, token: 'abc' }).success).toBe(false);
    expect(esquemaRestablecer.safeParse({ ...base, token: "' OR 1=1 --" }).success).toBe(false);
  });
});
