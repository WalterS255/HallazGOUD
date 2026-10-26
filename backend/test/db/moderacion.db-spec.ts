// Reportes y moderación (RF-26, RF-27) por HTTP real contra PostgreSQL real.
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { clienteTest, crearPublicacion, crearUsuario } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};
const textos: string[] = []; // todas las respuestas, para la revisión anti-fuga

const como = (quien: string | null) => {
  const r = (t: request.Test) => {
    const conSesion = quien ? t.set('Authorization', `Bearer ${tokens[quien]}`) : t;
    return conSesion.expect((res) => {
      textos.push(JSON.stringify(res.body));
    });
  };
  return {
    get: (ruta: string) => r(http.get(ruta)),
    post: (ruta: string, cuerpo: object) => r(http.post(ruta).send(cuerpo)),
    patch: (ruta: string, cuerpo: object) => r(http.patch(ruta).send(cuerpo)),
  };
};

beforeAll(async () => {
  prisma = clienteTest();
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());

  const jwt = app.get(JwtService);
  for (const [nombre, rol] of [
    ['autora', 'USUARIO'],
    ['ana', 'USUARIO'],
    ['beto', 'USUARIO'],
    ['moderadora', 'MODERADOR'],
    ['moderador2', 'MODERADOR'],
  ] as const) {
    const u = await crearUsuario(prisma);
    if (rol !== 'USUARIO') await prisma.usuario.update({ where: { id: u.id }, data: { rol } });
    ids[nombre] = u.id;
    tokens[nombre] = await jwt.signAsync({ sub: u.id, rol });
  }
  ids.pub = (await crearPublicacion(prisma, { tipo: 'ENCONTRADO', id_usuario: ids.autora })).id;
  ids.otra = (await crearPublicacion(prisma, { tipo: 'PERDIDO', id_usuario: ids.autora })).id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('reportar (RF-26)', () => {
  it('pide sesión, motivo válido, y no deja reportar lo propio', async () => {
    await como(null)
      .post('/api/reportes', { id_publicacion: ids.pub, motivo: 'foto con datos' })
      .expect(401);
    await como('ana').post('/api/reportes', { id_publicacion: ids.pub, motivo: 'no' }).expect(400);
    const propio = await como('autora')
      .post('/api/reportes', { id_publicacion: ids.pub, motivo: 'me equivoqué' })
      .expect(409);
    expect(propio.body.error.codigo).toBe('REPORTE_PROPIO');
  });

  it('dos personas reportan la misma; la misma persona no repite mientras siga pendiente', async () => {
    const cuerpo = { id_publicacion: ids.pub, motivo: 'La foto muestra el número del documento' };
    ids.reporteAna = (await como('ana').post('/api/reportes', cuerpo).expect(201)).body.id;
    await como('beto').post('/api/reportes', cuerpo).expect(201);
    const dup = await como('ana').post('/api/reportes', cuerpo).expect(409);
    expect(dup.body.error.codigo).toBe('REPORTE_DUPLICADO');
  });
});

describe('bandeja del moderador (RF-27)', () => {
  it('un usuario normal no entra; la moderadora ve los pendientes, el más viejo primero', async () => {
    await como('ana').get('/api/admin/reportes').expect(403);
    // Un reporte de hace 50 h: ya pasó el plazo de 48 h.
    await prisma.$executeRaw`UPDATE reporte SET fecha = now() - interval '50 hours' WHERE id = ${ids.reporteAna}`;
    const res = await como('moderadora').get('/api/admin/reportes').expect(200);
    const mios = res.body.filter(
      (r: { publicacion: { id: number } }) => r.publicacion.id === ids.pub,
    );
    expect(mios).toHaveLength(2);
    expect(mios[0]).toMatchObject({ id: ids.reporteAna, vencido: true });
    expect(mios[0].horas_pendiente).toBeGreaterThanOrEqual(50);
    expect(mios[1].vencido).toBe(false);
    expect(Object.keys(mios[0].reportante).sort()).toEqual(['id', 'nombre']);
  });
});

describe('resolver (RF-27)', () => {
  it('dos moderadores resuelven EL MISMO reporte a la vez → uno gana, el otro 409', async () => {
    const r = await prisma.reporte.create({
      data: { id_publicacion: ids.otra, id_reportante: ids.beto, motivo: 'contenido repetido' },
    });
    const [a, b] = await Promise.all([
      como('moderadora').patch(`/api/admin/reportes/${r.id}`, { decision: 'DESCARTAR' }),
      como('moderador2').patch(`/api/admin/reportes/${r.id}`, { decision: 'DESCARTAR' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 409]);
    expect((await prisma.reporte.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe(
      'DESCARTADO',
    );
    // Descartar no oculta nada.
    await como(null).get(`/api/publicaciones/${ids.otra}`).expect(200);
  });

  it('OCULTAR: la publicación desaparece, se cierran TODOS sus reportes y se avisa a la autora', async () => {
    await como('moderadora')
      .patch(`/api/admin/reportes/${ids.reporteAna}`, {
        decision: 'OCULTAR',
        motivo: 'la foto muestra datos personales',
      })
      .expect(204);

    await como(null).get(`/api/publicaciones/${ids.pub}`).expect(404);
    const reportes = await prisma.reporte.findMany({ where: { id_publicacion: ids.pub } });
    expect(reportes.map((r) => [r.estado, r.id_moderador])).toEqual([
      ['RESUELTO', ids.moderadora],
      ['RESUELTO', ids.moderadora],
    ]);
    expect(
      await prisma.auditoria.count({
        where: { accion: 'MODERACION_OCULTAR', id_entidad: ids.reporteAna },
      }),
    ).toBe(1);

    const avisos = await como('autora').get('/api/notificaciones').expect(200);
    const aviso = avisos.body.datos.find((n: { tipo: string }) => n.tipo === 'MODERACION');
    expect(aviso.mensaje).toContain('la foto muestra datos personales');

    // Ya resuelto: no se resuelve dos veces; y una oculta no se puede volver a reportar.
    await como('moderadora')
      .patch(`/api/admin/reportes/${ids.reporteAna}`, { decision: 'DESCARTAR' })
      .expect(409);
    await como('ana')
      .post('/api/reportes', { id_publicacion: ids.pub, motivo: 'sigue ahí' })
      .expect(404);
  });

  it('ANTI-FUGA: ninguna respuesta trae correos ni hashes', () => {
    for (const t of textos) {
      expect(t).not.toContain('@udistrital.edu.co');
      expect(t).not.toContain('hash_contrasena');
    }
  });
});
