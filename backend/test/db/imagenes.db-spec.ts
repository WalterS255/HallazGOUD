// Subida, consulta y borrado de imágenes (RF-08, RNF-02) por HTTP, contra PostgreSQL
// real. El almacenamiento S3 queda en memoria (NODE_ENV=test): AlmacenamientoService.
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AlmacenamientoService } from '../../src/lib/almacenamiento/almacenamiento.service.js';
import { clienteTest, crearPublicacion, crearUsuario } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let jpeg: Buffer;

beforeAll(async () => {
  prisma = clienteTest();
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());
  jpeg = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const enS3 = () => app.get(AlmacenamientoService).enMemoria.size;

// Un autor con sesión y una publicación ENCONTRADO suya.
async function escenario() {
  const autor = await crearUsuario(prisma);
  const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO', id_usuario: autor.id });
  const auth = `Bearer ${await app.get(JwtService).signAsync({ sub: autor.id, rol: 'USUARIO' })}`;
  const subir = (n: number, contenido = jpeg, nombre = 'foto.jpg') => {
    let r = http.post(`/api/publicaciones/${pub.id}/imagenes`).set('Authorization', auth);
    for (let i = 0; i < n; i++) r = r.attach('imagenes', contenido, nombre);
    return r;
  };
  return { autor, pub, auth, subir };
}

describe('POST /api/publicaciones/:id/imagenes', () => {
  it('sube 2 imágenes: quedan con orden 1 y 2, en WEBP, y se pueden ver sin sesión', async () => {
    const { subir } = await escenario();
    const res = await subir(2).expect(201);
    expect(res.body.map((i: { orden: number }) => i.orden)).toEqual([1, 2]);

    // Se sirven desde el backend, públicas, con caché larga.
    const mini = await http.get(res.body[0].url_miniatura).expect(200);
    expect(mini.headers['content-type']).toBe('image/webp');
    expect(mini.headers['cache-control']).toContain('immutable');
    expect(mini.body.length).toBeLessThanOrEqual(200 * 1024); // RNF-02
    expect((await sharp(mini.body).metadata()).format).toBe('webp');
  });

  it('más de 5 en total → 409, y NO queda ningún archivo a medias en S3', async () => {
    const { subir, pub } = await escenario();
    await subir(3).expect(201);
    const antes = enS3();
    const res = await subir(3).expect(409);
    expect(res.body.error.codigo).toBe('DEMASIADAS_IMAGENES');
    expect(enS3()).toBe(antes);
    expect(await prisma.imagen.count({ where: { id_publicacion: pub.id } })).toBe(3);
  });

  it('un archivo que no es imagen (aunque se llame .jpg) → 400, y no se guarda nada', async () => {
    const { subir } = await escenario();
    const antes = enS3();
    const res = await subir(1, Buffer.from('MZ esto es un ejecutable'), 'foto.jpg').expect(400);
    expect(res.body.error.codigo).toBe('IMAGEN_INVALIDA');
    expect(enS3()).toBe(antes);
  });

  it('un archivo de más de 5 MB → 413 DEMASIADO_GRANDE', async () => {
    const { subir } = await escenario();
    const enorme = Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await subir(1, enorme).expect(413);
    expect(res.body.error.codigo).toBe('DEMASIADO_GRANDE');
  });

  it('sin archivos → 400 SIN_IMAGENES; sin sesión → 401; otra persona → 403', async () => {
    const { subir, pub } = await escenario();
    expect((await subir(0).expect(400)).body.error.codigo).toBe('SIN_IMAGENES');
    await http
      .post(`/api/publicaciones/${pub.id}/imagenes`)
      .attach('imagenes', jpeg, 'a.jpg')
      .expect(401);

    const otra = await crearUsuario(prisma);
    const auth = `Bearer ${await app.get(JwtService).signAsync({ sub: otra.id, rol: 'USUARIO' })}`;
    await http
      .post(`/api/publicaciones/${pub.id}/imagenes`)
      .set('Authorization', auth)
      .attach('imagenes', jpeg, 'a.jpg')
      .expect(403);
  });
});

describe('DELETE /api/publicaciones/:id/imagenes/:orden', () => {
  it('borra de la BD y de S3; el hueco se vuelve a usar en la siguiente subida', async () => {
    const { subir, pub, auth } = await escenario();
    const subidas = (await subir(2).expect(201)).body;
    const antes = enS3();

    await http
      .delete(`/api/publicaciones/${pub.id}/imagenes/1`)
      .set('Authorization', auth)
      .expect(200);
    expect(enS3()).toBe(antes - 2); // la grande y la miniatura
    await http.get(subidas[0].url).expect(404);

    const despues = (await subir(1).expect(201)).body;
    expect(despues.map((i: { orden: number }) => i.orden)).toEqual([1, 2]);
  });
});

describe('GET /api/imagenes/…', () => {
  it('una publicación oculta por moderación no muestra sus imágenes (404)', async () => {
    const { subir, pub } = await escenario();
    const [img] = (await subir(1).expect(201)).body;
    await http.get(img.url).expect(200);
    await prisma.publicacion.update({ where: { id: pub.id }, data: { oculta: true } });
    await http.get(img.url).expect(404);
  });

  it('no se puede pedir nada fuera de las imágenes (../ ni otros nombres) → 404', async () => {
    await http.get('/api/imagenes/publicaciones/1/..%2F..%2F.env').expect(404);
    await http.get('/api/imagenes/publicaciones/1/cualquier-cosa.png').expect(404);
  });
});
