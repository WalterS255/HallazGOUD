import { Controller, Get, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { LIMITE_ESTRICTO, LimiteEstricto } from '../src/comun/limites/limites.js';
import { configurarApp } from '../src/configurar-app.js';

// Controlador que SOLO existe en esta prueba: imita una ruta de login.
@Controller('prueba-limites')
class ControladorDePrueba {
  @LimiteEstricto()
  @Post('login')
  login() {
    return { ok: true };
  }

  @Get('normal')
  normal() {
    return { ok: true };
  }
}

describe('Rate limit (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  // Cada prueba arranca una app nueva: los contadores viven en memoria y así
  // una prueba no hereda los intentos de la anterior.
  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControladorDePrueba],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configurarApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  it(`login: los primeros ${LIMITE_ESTRICTO.limit} pasan y el siguiente da 429`, async () => {
    for (let i = 1; i <= LIMITE_ESTRICTO.limit; i++) {
      await http.post('/api/prueba-limites/login').expect(201);
    }
    const res = await http.post('/api/prueba-limites/login').expect(429);
    expect(res.body).toEqual({
      error: {
        codigo: 'DEMASIADAS_SOLICITUDES',
        mensaje: 'Demasiados intentos. Espera un momento.',
      },
    });
    // Le dice al cliente cuántos segundos esperar.
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('una ruta normal NO se bloquea con el límite estricto', async () => {
    for (let i = 1; i <= LIMITE_ESTRICTO.limit + 3; i++) {
      await http.get('/api/prueba-limites/normal').expect(200);
    }
  });

  it('/api/salud nunca se bloquea (la usan Docker y el monitoreo)', async () => {
    for (let i = 1; i <= 120; i++) {
      await http.get('/api/salud').expect(200);
    }
  });
});
