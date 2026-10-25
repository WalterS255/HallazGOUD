import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/configurar-app.js';

// Prueba de punta a punta (e2e): app completa + peticiones HTTP reales con Supertest,
// pero sin abrir un puerto de verdad.
describe('GET /api/salud (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 con { ok: true } en JSON', async () => {
    const res = await request(app.getHttpServer()).get('/api/salud').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ ok: true });
  });

  it('no revela que usa Express', async () => {
    const res = await request(app.getHttpServer()).get('/api/salud');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  // Esta sí toca la BD real (la del DATABASE_URL): necesita `docker compose up -d`.
  it('GET /api/salud/bd confirma que llega a PostgreSQL', async () => {
    const res = await request(app.getHttpServer()).get('/api/salud/bd').expect(200);
    expect(res.body).toMatchObject({ ok: true, bd: 'conectada' });
    expect(typeof res.body.latencia_ms).toBe('number');
  });

  it('la ruta sin prefijo /api no existe', async () => {
    await request(app.getHttpServer()).get('/salud').expect(404);
  });
});
