// Perfil (RF-05) y reenvío del correo de verificación (RF-02) por HTTP, contra
// PostgreSQL real. Correos y S3 quedan en memoria (NODE_ENV=test).
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AlmacenamientoService } from '../../src/lib/almacenamiento/almacenamiento.service.js';
import { CorreoService } from '../../src/lib/correo/correo.service.js';
import { clienteTest, crearUsuario, unico } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  prisma = clienteTest();
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function conSesion() {
  const u = await crearUsuario(prisma);
  const auth = `Bearer ${await app.get(JwtService).signAsync({ sub: u.id, rol: 'USUARIO' })}`;
  return { u, auth };
}

const enviados = () => app.get(CorreoService).enviadosEnPrueba;

describe('PUT /api/usuarios/me', () => {
  it('cambia nombre, programa y preferencias; el correo NO cambia', async () => {
    const { u, auth } = await conSesion();
    const res = await http
      .put('/api/usuarios/me')
      .set('Authorization', auth)
      .send({
        nombre: 'Ana María',
        programa: 'Ing. Catastral',
        notificar_por_correo: false,
        correo: 'otro@udistrital.edu.co',
      })
      .expect(200);
    expect(res.body).toMatchObject({
      nombre: 'Ana María',
      programa: 'Ing. Catastral',
      notificar_por_correo: false,
      correo: u.correo,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash_contrasena|\$2[aby]\$/);
  });

  it('cuerpo vacío → 400; "false" como texto no vale como booleano → 400', async () => {
    const { auth } = await conSesion();
    await http.put('/api/usuarios/me').set('Authorization', auth).send({}).expect(400);
    const r = await http
      .put('/api/usuarios/me')
      .set('Authorization', auth)
      .send({ notificar_por_correo: 'false' })
      .expect(400);
    expect(r.body.error.detalles[0].campo).toBe('notificar_por_correo');
  });

  it('sin sesión → 401', async () => {
    await http.put('/api/usuarios/me').send({ nombre: 'Nadie' }).expect(401);
  });
});

describe('foto de perfil', () => {
  it('sube, se ve pública, se reemplaza (borra la anterior) y se quita', async () => {
    const { auth } = await conSesion();
    const s3 = app.get(AlmacenamientoService).enMemoria;
    const foto = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 0, g: 120, b: 60 } },
    })
      .jpeg()
      .toBuffer();

    const r1 = await http
      .post('/api/usuarios/me/foto')
      .set('Authorization', auth)
      .attach('foto', foto, 'yo.jpg')
      .expect(201);
    const url1: string = r1.body.foto_url;
    expect(url1).toMatch(/^\/api\/imagenes\/usuarios\/\d+\/[0-9a-f-]{36}\.webp$/);
    const img = await http.get(url1).expect(200);
    const m = await sharp(img.body).metadata();
    expect([m.width, m.height, m.format]).toEqual([256, 256, 'webp']);

    const r2 = await http
      .post('/api/usuarios/me/foto')
      .set('Authorization', auth)
      .attach('foto', foto, 'yo2.jpg')
      .expect(201);
    expect(r2.body.foto_url).not.toBe(url1);
    await http.get(url1).expect(404); // la anterior se borró del almacenamiento
    expect(s3.has(url1.replace('/api/imagenes/', ''))).toBe(false);

    const r3 = await http.delete('/api/usuarios/me/foto').set('Authorization', auth).expect(200);
    expect(r3.body.foto_url).toBeNull();
    await http.get(r2.body.foto_url).expect(404);
  });

  it('un archivo que no es imagen → 400 IMAGEN_INVALIDA', async () => {
    const { auth } = await conSesion();
    const r = await http
      .post('/api/usuarios/me/foto')
      .set('Authorization', auth)
      .attach('foto', Buffer.from('no soy una foto'), 'yo.jpg')
      .expect(400);
    expect(r.body.error.codigo).toBe('IMAGEN_INVALIDA');
  });
});

describe('POST /api/auth/reenviar-verificacion', () => {
  async function registrar() {
    const correo = `${unico('r')}@udistrital.edu.co`;
    await http
      .post('/api/auth/registro')
      .send({
        nombre: 'Reenvío',
        correo,
        programa: 'Sistemas',
        contrasena: 'clave1234',
        aceptaPolitica: true,
      })
      .expect(201);
    return correo;
  }
  const tokenDe = (texto: string) => texto.match(/[0-9a-f]{64}/)![0];

  it('responde igual exista o no; no reenvía antes de 2 minutos', async () => {
    const correo = await registrar();
    const antes = enviados().length;
    const noExiste = await http
      .post('/api/auth/reenviar-verificacion')
      .send({ correo: 'nadie@udistrital.edu.co' })
      .expect(202);
    // Recién registrado: el primer enlace se envió hace segundos → no se manda otro.
    const pronto = await http.post('/api/auth/reenviar-verificacion').send({ correo }).expect(202);
    expect(pronto.body).toEqual(noExiste.body);
    expect(enviados().length).toBe(antes);
  });

  it('pasados 2 minutos envía un enlace NUEVO y el anterior deja de servir', async () => {
    const correo = await registrar();
    const viejo = tokenDe(enviados().at(-1)!.texto);
    // Simular que el primer correo se envió hace 3 minutos.
    const u = await prisma.usuario.findFirstOrThrow({ where: { correo } });
    await prisma.token_usuario.updateMany({
      where: { id_usuario: u.id },
      data: { creado_en: new Date(Date.now() - 3 * 60_000) },
    });

    await http.post('/api/auth/reenviar-verificacion').send({ correo }).expect(202);
    const nuevo = tokenDe(enviados().at(-1)!.texto);
    expect(nuevo).not.toBe(viejo);

    expect((await http.get(`/api/auth/verificar/${viejo}`).expect(400)).body.error.codigo).toBe(
      'TOKEN_USADO',
    );
    await http.get(`/api/auth/verificar/${nuevo}`).expect(200);
  });

  it('una cuenta ya verificada no recibe otro correo', async () => {
    const correo = await registrar();
    await http.get(`/api/auth/verificar/${tokenDe(enviados().at(-1)!.texto)}`).expect(200);
    const antes = enviados().length;
    await http.post('/api/auth/reenviar-verificacion').send({ correo }).expect(202);
    expect(enviados().length).toBe(antes);
  });
});
