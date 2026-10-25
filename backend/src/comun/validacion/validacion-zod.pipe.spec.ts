import { z } from 'zod';
import { ErrorApp } from '../errores/error-app.js';
import { ValidacionZod } from './validacion-zod.pipe.js';

const esquema = z.object({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .endsWith('@udistrital.edu.co', { error: 'Debe ser un correo @udistrital.edu.co' }),
  edad: z.number().int().min(16),
});

// Ejecuta el pipe y devuelve el ErrorApp que lanzó (o falla si no lanzó nada).
function errorDe(valor: unknown): ErrorApp {
  try {
    new ValidacionZod(esquema).transform(valor);
  } catch (e) {
    return e as ErrorApp;
  }
  throw new Error('se esperaba que el pipe rechazara el valor');
}

describe('ValidacionZod', () => {
  it('devuelve los datos ya procesados (trim, minúsculas)', () => {
    const r = new ValidacionZod(esquema).transform({
      correo: '  APerez@UDistrital.edu.co ',
      edad: 20,
    });
    expect(r).toEqual({ correo: 'aperez@udistrital.edu.co', edad: 20 });
  });

  it('quita los campos que el esquema no conoce (nadie se cuela un "rol": "ADMIN")', () => {
    const r = new ValidacionZod(esquema).transform({
      correo: 'a@udistrital.edu.co',
      edad: 20,
      rol: 'ADMIN',
    });
    expect(r).not.toHaveProperty('rol');
  });

  it('rechaza con 400, SOLICITUD_INVALIDA y un detalle por campo', () => {
    const e = errorDe({ correo: 'a@gmail.com', edad: 10 });
    expect(e.getStatus()).toBe(400);
    expect(e.codigo).toBe('SOLICITUD_INVALIDA');
    expect(e.detalles).toEqual([
      { campo: 'correo', mensaje: 'Debe ser un correo @udistrital.edu.co' },
      { campo: 'edad', mensaje: expect.stringContaining('16') },
    ]);
  });

  it('usa mensajes de Zod en español cuando el esquema no trae uno propio', () => {
    const e = errorDe({ correo: 'a@udistrital.edu.co' });
    expect(e.detalles?.[0]).toEqual({
      campo: 'edad',
      mensaje: expect.stringMatching(/se esperaba/i),
    });
  });

  it('si el cuerpo no es un objeto, el campo es "(cuerpo)"', () => {
    expect(errorDe('hola').detalles?.[0]?.campo).toBe('(cuerpo)');
  });
});
