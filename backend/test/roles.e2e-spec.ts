import { Controller, Get, Injectable, type NestMiddleware } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { type Rol, Roles, RolesGuard } from '../src/comun/autorizacion/roles.js';
import { configurarApp } from '../src/configurar-app.js';

// Mientras no exista el guard de sesión con JWT (Fase D), esta prueba "inicia sesión"
// con un encabezado falso X-Rol-Prueba. Solo existe aquí: la app real no lo lee.
@Injectable()
class SesionFalsa implements NestMiddleware {
  use(req: Request & { usuario?: { id: number; rol: Rol } }, _res: Response, next: NextFunction) {
    const rol = req.header('x-rol-prueba') as Rol | undefined;
    if (rol) req.usuario = { id: 1, rol };
    next();
  }
}

@Controller('prueba-roles')
class ControladorDePrueba {
  @Get('publica')
  publica() {
    return { ok: true };
  }

  @Roles('ADMIN')
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Roles('MODERADOR', 'ADMIN')
  @Get('moderacion')
  moderacion() {
    return { ok: true };
  }
}

describe('Guard de roles (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControladorDePrueba],
      providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    app.use((req: Request, res: Response, next: NextFunction) =>
      new SesionFalsa().use(req, res, next),
    );
    configurarApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('una ruta sin @Roles es accesible para cualquiera', async () => {
    await http.get('/api/prueba-roles/publica').expect(200);
  });

  it('sin sesión → 401 NO_AUTENTICADO', async () => {
    const res = await http.get('/api/prueba-roles/admin').expect(401);
    expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('USUARIO en ruta de ADMIN → 403 PROHIBIDO', async () => {
    const res = await http
      .get('/api/prueba-roles/admin')
      .set('X-Rol-Prueba', 'USUARIO')
      .expect(403);
    expect(res.body.error.codigo).toBe('PROHIBIDO');
  });

  it('MODERADOR en ruta de ADMIN → 403 (moderar no es administrar)', async () => {
    await http.get('/api/prueba-roles/admin').set('X-Rol-Prueba', 'MODERADOR').expect(403);
  });

  it.each<Rol>(['MODERADOR', 'ADMIN'])('%s puede entrar a moderación', async (rol) => {
    await http.get('/api/prueba-roles/moderacion').set('X-Rol-Prueba', rol).expect(200);
  });

  it('ADMIN en ruta de ADMIN → 200', async () => {
    await http.get('/api/prueba-roles/admin').set('X-Rol-Prueba', 'ADMIN').expect(200);
  });
});
