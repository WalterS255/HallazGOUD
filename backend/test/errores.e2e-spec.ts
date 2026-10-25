import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ErrorApp } from '../src/comun/errores/error-app.js';
import { configurarApp } from '../src/configurar-app.js';

// Controlador que SOLO existe en esta prueba: provoca cada tipo de error a propósito.
@Controller('prueba-errores')
class ControladorDePrueba {
  @Get('inesperado')
  inesperado(): never {
    throw new Error('column "hash_contrasena" does not exist');
  }

  @Get('negocio')
  negocio(): never {
    throw new ErrorApp(
      HttpStatus.CONFLICT,
      'RECLAMACION_DUPLICADA',
      'Ya tienes una reclamación pendiente.',
    );
  }

  @Get('async')
  async asincrono(): Promise<never> {
    await Promise.resolve();
    throw new Error('falló algo dentro de un await');
  }

  @Post('eco')
  eco(@Body() cuerpo: unknown): unknown {
    return cuerpo;
  }
}

describe('Formato de errores (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControladorDePrueba],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configurarApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('ruta inexistente → 404 con nuestro formato', async () => {
    const res = await http.get('/api/no-existe').expect(404);
    expect(res.body).toEqual({
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'El recurso no existe.' },
    });
  });

  it('error inesperado → 500 genérico, SIN detalles internos', async () => {
    const res = await http.get('/api/prueba-errores/inesperado').expect(500);
    expect(res.body.error.codigo).toBe('ERROR_INTERNO');
    expect(JSON.stringify(res.body)).not.toMatch(/hash_contrasena|column|stack/);
  });

  it('error dentro de una función async → también lo atrapa el filtro', async () => {
    const res = await http.get('/api/prueba-errores/async').expect(500);
    expect(res.body.error.codigo).toBe('ERROR_INTERNO');
  });

  it('error de negocio → su propio estado, código y mensaje', async () => {
    const res = await http.get('/api/prueba-errores/negocio').expect(409);
    expect(res.body).toEqual({
      error: { codigo: 'RECLAMACION_DUPLICADA', mensaje: 'Ya tienes una reclamación pendiente.' },
    });
  });

  it('JSON mal escrito → 400, no 500', async () => {
    const res = await http
      .post('/api/prueba-errores/eco')
      .set('Content-Type', 'application/json')
      .send('{"titulo": "audífonos",')
      .expect(400);
    expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
  });

  it('cuerpo de más de 100 KB → 413', async () => {
    const res = await http
      .post('/api/prueba-errores/eco')
      .send({ descripcion: 'x'.repeat(150_000) })
      .expect(413);
    expect(res.body.error.codigo).toBe('DEMASIADO_GRANDE');
  });

  it('cada respuesta trae un X-Request-Id para rastrearla en el log', async () => {
    const res = await http.get('/api/salud');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
