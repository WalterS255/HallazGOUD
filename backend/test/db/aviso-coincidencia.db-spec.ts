// RF-24 de punta a punta por HTTP: Ana publica un PERDIDO, Beto publica un ENCONTRADO
// parecido, y a Ana le llega el aviso (en la app y por correo).
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { CorreoService } from '../../src/lib/correo/correo.service.js';
import { clienteTest, crearUsuario, unico } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};

beforeAll(async () => {
  prisma = clienteTest();
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());
  const jwt = app.get(JwtService);
  for (const nombre of ['ana', 'beto']) {
    const u = await crearUsuario(prisma);
    ids[nombre] = u.id;
    tokens[nombre] = await jwt.signAsync({ sub: u.id, rol: 'USUARIO' });
  }
  const sede = await prisma.sede.create({ data: { nombre: unico('Sede RF24 ') } });
  ids.lugar = (
    await prisma.lugar.create({ data: { id_sede: sede.id, edificio: 'Biblioteca' } })
  ).id;
  ids.cat = (await prisma.categoria.create({ data: { nombre: unico('Útiles RF24 ') } })).id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const publicar = (quien: string, cuerpo: object) =>
  http
    .post('/api/publicaciones')
    .set('Authorization', `Bearer ${tokens[quien]}`)
    .send({
      id_categoria: ids.cat,
      id_lugar: ids.lugar,
      fecha_suceso: new Date(Date.now() - 3_600_000).toISOString(),
      ...cuerpo,
    });

const avisosDe = async (quien: string) =>
  (
    await http
      .get('/api/notificaciones')
      .set('Authorization', `Bearer ${tokens[quien]}`)
      .expect(200)
  ).body.datos as { tipo: string; id_referencia: number }[];

describe('aviso de coincidencia al publicar (RF-24)', () => {
  it('el ENCONTRADO de Beto avisa a Ana, dueña del PERDIDO compatible', async () => {
    await publicar('ana', {
      tipo: 'PERDIDO',
      titulo: 'Perdí mi calculadora Casio',
      descripcion: 'Calculadora científica gris con tapa negra',
    }).expect(201);
    const correosAntes = app.get(CorreoService).enviadosEnPrueba.length;

    const encontrado = await publicar('beto', {
      tipo: 'ENCONTRADO',
      titulo: 'Calculadora Casio encontrada',
      descripcion: 'Calculadora científica gris en la biblioteca',
      detalle_reservado: 'tiene una calcomanía',
    }).expect(201);

    const avisos = (await avisosDe('ana')).filter((a) => a.tipo === 'COINCIDENCIA');
    expect(avisos.map((a) => a.id_referencia)).toEqual([encontrado.body.id]);
    expect(app.get(CorreoService).enviadosEnPrueba.length).toBe(correosAntes + 1);
  });

  it('un PERDIDO no avisa a nadie (su autor consulta GET …/coincidencias)', async () => {
    const antes = (await avisosDe('beto')).length;
    await publicar('ana', {
      tipo: 'PERDIDO',
      titulo: 'Perdí otra calculadora',
      descripcion: 'Calculadora científica gris sin tapa',
    }).expect(201);
    expect((await avisosDe('beto')).length).toBe(antes);
  });
});
