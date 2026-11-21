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
    configurarApp(app, 0); // explícito: sin proxy, diga lo que diga el .env
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

  it('sin TRUST_PROXY, inventar X-Forwarded-For no salta el límite', async () => {
    for (let i = 1; i <= LIMITE_ESTRICTO.limit; i++) {
      await http
        .post('/api/prueba-limites/login')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .expect(201);
    }
    await http.post('/api/prueba-limites/login').set('X-Forwarded-For', '10.0.0.99').expect(429);
  });
});

describe('Rate limit detrás de un proxy (TRUST_PROXY=1)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControladorDePrueba],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configurarApp(app, 1);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  const login = (xff: string) => http.post('/api/prueba-limites/login').set('X-Forwarded-For', xff);

  it('cada IP real tiene su propio límite (ya no lo comparten todos)', async () => {
    for (let i = 1; i <= LIMITE_ESTRICTO.limit; i++) await login('181.50.7.9').expect(201);
    await login('181.50.7.9').expect(429);
    await login('190.24.1.1').expect(201); // otra persona: no la frena el abuso de la primera
  });

  it('lo que el cliente inventa a la izquierda se ignora: cuenta la IP que puso el proxy', async () => {
    for (let i = 1; i <= LIMITE_ESTRICTO.limit; i++) {
      await login(`10.0.0.${i}, 181.50.7.9`).expect(201);
    }
    await login('10.0.0.99, 181.50.7.9').expect(429);
  });
});
