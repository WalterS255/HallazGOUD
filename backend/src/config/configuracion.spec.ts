import { cargarConfig } from './configuracion.js';

// Variables válidas mínimas; cada prueba cambia solo lo que quiere probar.
const validas = {
  NODE_ENV: 'development',
  URL_FRONTEND: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://u:p@localhost:5433/hallazgo_ud',
  JWT_SECRET: 'x'.repeat(40),
  JWT_EXPIRA_EN: '1d',
  BCRYPT_COSTE: '12',
  DOMINIO_CORREO: 'UDistrital.edu.co',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'HallazGO UD <no-responder@hallazgo.local>',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'hallazgo-imagenes',
  S3_ACCESS_KEY: 'llave',
  S3_SECRET_KEY: 'secreto',
};

describe('cargarConfig', () => {
  it('convierte los textos del .env en números y valores por defecto', () => {
    const c = cargarConfig(validas);
    expect(c.puerto).toBe(3000);
    expect(c.bcryptCoste).toBe(12);
    expect(c.smtp.puerto).toBe(1025);
    expect(c.dominioCorreo).toBe('udistrital.edu.co');
    expect(c.zonaHoraria).toBe('America/Bogota');
  });

  it('lista TODOS los problemas a la vez, no solo el primero', () => {
    const sinJwt = { ...validas, JWT_SECRET: undefined, BCRYPT_COSTE: '8', PUERTO: 'abc' };
    let mensaje = '';
    try {
      cargarConfig(sinJwt);
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain('JWT_SECRET: es obligatoria');
    expect(mensaje).toContain('BCRYPT_COSTE: debe ser al menos 10');
    expect(mensaje).toContain('PUERTO: debe ser un número');
  });

  it('rechaza un JWT_SECRET corto', () => {
    expect(() => cargarConfig({ ...validas, JWT_SECRET: 'corto' })).toThrow(/al menos 32/);
  });

  it('rechaza una DATABASE_URL que no es de PostgreSQL', () => {
    expect(() => cargarConfig({ ...validas, DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });

  it('en producción rechaza los valores de ejemplo de .env.example', () => {
    const conEjemplo = {
      ...validas,
      NODE_ENV: 'production',
      JWT_SECRET: 'cambia-esto-por-un-valor-largo-y-aleatorio',
    };
    expect(() => cargarConfig(conEjemplo)).toThrow(/valor de ejemplo/);
  });

  it('en desarrollo sí permite los valores de ejemplo', () => {
    const conEjemplo = { ...validas, JWT_SECRET: 'cambia-esto-por-un-valor-largo-y-aleatorio' };
    expect(() => cargarConfig(conEjemplo)).not.toThrow();
  });
});
