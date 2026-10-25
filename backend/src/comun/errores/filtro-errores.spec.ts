import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ErrorApp } from './error-app.js';
import { FiltroErrores } from './filtro-errores.js';

// Prueba unitaria de la traducción: error de entrada → { estado, cuerpo }.
describe('FiltroErrores.traducir', () => {
  const filtro = new FiltroErrores();

  it('respeta el código y mensaje de un ErrorApp', () => {
    const r = filtro.traducir(new ErrorApp(HttpStatus.CONFLICT, 'RECLAMACION_DUPLICADA', 'Ya reclamaste esto.'));
    expect(r).toEqual({
      estado: 409,
      cuerpo: { error: { codigo: 'RECLAMACION_DUPLICADA', mensaje: 'Ya reclamaste esto.' } },
    });
  });

  it('traduce los errores de Nest a nuestro formato', () => {
    expect(filtro.traducir(new NotFoundException()).cuerpo.error.codigo).toBe('NO_ENCONTRADO');
    expect(filtro.traducir(new BadRequestException()).estado).toBe(400);
  });

  it('no deja pasar el mensaje en inglés de Nest', () => {
    const r = filtro.traducir(new NotFoundException('Cannot GET /api/x'));
    expect(r.cuerpo.error.mensaje).toBe('El recurso no existe.');
  });

  it('un error inesperado se vuelve 500 genérico, sin detalles internos', () => {
    const r = filtro.traducir(new Error('column "correo" does not exist'));
    expect(r.estado).toBe(500);
    expect(r.cuerpo.error.codigo).toBe('ERROR_INTERNO');
    expect(JSON.stringify(r.cuerpo)).not.toContain('correo');
  });

  it('el JSON mal escrito (error de Express con status 400) es 400, no 500', () => {
    const errorExpress = Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' });
    expect(filtro.traducir(errorExpress).estado).toBe(400);
  });
});
