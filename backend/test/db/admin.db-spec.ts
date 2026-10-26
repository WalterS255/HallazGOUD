// Catálogos (RF-28) y cuentas (RF-29) por HTTP real contra PostgreSQL real.
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { clienteTest, crearPublicacion, crearUsuario, unico } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};
const textos: string[] = [];

const como = (quien: string | null) => {
  const r = (t: request.Test) =>
    (quien ? t.set('Authorization', `Bearer ${tokens[quien]}`) : t).expect((res) => {
      textos.push(JSON.stringify(res.body));
    });
  return {
    get: (ruta: string) => r(http.get(ruta)),
    post: (ruta: string, c: object) => r(http.post(ruta).send(c)),
    patch: (ruta: string, c: object) => r(http.patch(ruta).send(c)),
    delete: (ruta: string) => r(http.delete(ruta)),
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
    ['admin', 'ADMIN'],
    ['usuaria', 'USUARIO'],
  ] as const) {
    const u = await crearUsuario(prisma);
    if (rol === 'ADMIN') await prisma.usuario.update({ where: { id: u.id }, data: { rol } });
    ids[nombre] = u.id;
    tokens[nombre] = await jwt.signAsync({ sub: u.id, rol });
  }
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('catálogos (RF-28)', () => {
  const nombreCat = unico('Paraguas ');
  const nombreSede = unico('Sede Admin ');

  it('solo ADMIN gestiona; una usuaria recibe 403', async () => {
    await como('usuaria').post('/api/admin/categorias', { nombre: 'Intento' }).expect(403);
    await como(null).post('/api/admin/sedes', { nombre: 'Intento' }).expect(401);
  });

  it('crear categoría; el nombre repetido es 409 NOMBRE_REPETIDO', async () => {
    ids.cat = (
      await como('admin')
        .post('/api/admin/categorias', { nombre: nombreCat, sensible: false })
        .expect(201)
    ).body.id;
    const dup = await como('admin')
      .post('/api/admin/categorias', { nombre: nombreCat })
      .expect(409);
    expect(dup.body.error.codigo).toBe('NOMBRE_REPETIDO');
  });

  it('desactivar una categoría la saca del catálogo público, sin borrarla', async () => {
    const enPublico = async () =>
      (await como(null).get('/api/catalogos').expect(200)).body.categorias.some(
        (c: { id: number }) => c.id === ids.cat,
      );
    expect(await enPublico()).toBe(true);
    await como('admin').patch(`/api/admin/categorias/${ids.cat}`, { activa: false }).expect(200);
    expect(await enPublico()).toBe(false);
    expect(await prisma.categoria.count({ where: { id: ids.cat } })).toBe(1);
    await como('admin').patch(`/api/admin/categorias/${ids.cat}`, {}).expect(400); // nada que cambiar
  });

  it('sede con lugares no se borra (EN_USO); lugar con publicaciones tampoco', async () => {
    ids.sede = (
      await como('admin').post('/api/admin/sedes', { nombre: nombreSede }).expect(201)
    ).body.id;
    ids.lugar = (
      await como('admin')
        .post('/api/admin/lugares', { id_sede: ids.sede, edificio: 'Bloque 1' })
        .expect(201)
    ).body.id;
    const enUso = await como('admin').delete(`/api/admin/sedes/${ids.sede}`).expect(409);
    expect(enUso.body.error.codigo).toBe('EN_USO');

    const pub = await crearPublicacion(prisma, { tipo: 'PERDIDO' });
    await prisma.publicacion.update({ where: { id: pub.id }, data: { id_lugar: ids.lugar } });
    await como('admin').delete(`/api/admin/lugares/${ids.lugar}`).expect(409);
  });

  it('lugar en una sede que no existe → 400; editar algo inexistente → 404', async () => {
    const r = await como('admin')
      .post('/api/admin/lugares', { id_sede: 999999, edificio: 'Fantasma' })
      .expect(400);
    expect(r.body.error.codigo).toBe('SEDE_NO_EXISTE');
    await como('admin').patch('/api/admin/sedes/999999', { nombre: 'No existe' }).expect(404);
  });

  it('una sede vacía sí se borra', async () => {
    const s = (
      await como('admin')
        .post('/api/admin/sedes', { nombre: unico('Sede vacía ') })
        .expect(201)
    ).body.id;
    await como('admin').delete(`/api/admin/sedes/${s}`).expect(204);
    expect(await prisma.sede.count({ where: { id: s } })).toBe(0);
  });

  it('el catálogo público trae las sedes con sus lugares', async () => {
    const res = await como(null).get('/api/catalogos').expect(200);
    const sede = res.body.sedes.find((s: { id: number }) => s.id === ids.sede);
    expect(sede.lugares.map((l: { edificio: string }) => l.edificio)).toEqual(['Bloque 1']);
  });
});

describe('cuentas (RF-29)', () => {
  let objetivo: { id: number; correo: string | null };

  beforeAll(async () => {
    objetivo = await crearUsuario(prisma);
  });

  it('el admin busca por nombre o correo exacto; la respuesta NO trae el correo', async () => {
    const res = await como('admin').get(`/api/admin/usuarios?q=${objetivo.correo}`).expect(200);
    expect(res.body.map((u: { id: number }) => u.id)).toEqual([objetivo.id]);
    expect(Object.keys(res.body[0])).not.toContain('correo');
    // Un pedazo del correo NO sirve para "pescar" cuentas.
    const parcial = await como('admin').get('/api/admin/usuarios?q=udistrital.edu').expect(200);
    expect(parcial.body.some((u: { id: number }) => u.id === objetivo.id)).toBe(false);
    await como('usuaria').get('/api/admin/usuarios?q=Persona').expect(403);
  });

  it('suspender: cambia el estado, audita y deja un aviso; repetir es SIN_CAMBIO', async () => {
    const res = await como('admin')
      .patch(`/api/admin/usuarios/${objetivo.id}`, { accion: 'SUSPENDER', motivo: 'spam' })
      .expect(200);
    expect(res.body.estado_cuenta).toBe('SUSPENDIDA');
    expect(
      await prisma.auditoria.count({
        where: { accion: 'CUENTA_SUSPENDIDA', id_entidad: objetivo.id },
      }),
    ).toBe(1);
    const aviso = await prisma.notificacion.findFirst({
      where: { id_usuario: objetivo.id, tipo: 'ESTADO' },
    });
    expect(aviso?.mensaje).toContain('suspendida: spam');
    const otra = await como('admin')
      .patch(`/api/admin/usuarios/${objetivo.id}`, { accion: 'SUSPENDER' })
      .expect(409);
    expect(otra.body.error.codigo).toBe('SIN_CAMBIO');
  });

  it('reactivar vuelve a ACTIVA', async () => {
    const res = await como('admin')
      .patch(`/api/admin/usuarios/${objetivo.id}`, { accion: 'REACTIVAR' })
      .expect(200);
    expect(res.body.estado_cuenta).toBe('ACTIVA');
  });

  it('un admin no se suspende a sí mismo; una cuenta anonimizada no se toca', async () => {
    const yo = await como('admin')
      .patch(`/api/admin/usuarios/${ids.admin}`, { accion: 'SUSPENDER' })
      .expect(409);
    expect(yo.body.error.codigo).toBe('ACCION_SOBRE_SI_MISMO');
    const anonima = await crearUsuario(prisma);
    await prisma.usuario.update({
      where: { id: anonima.id },
      data: { nombre: null, correo: null, hash_contrasena: null, estado_cuenta: 'ELIMINADA' },
    });
    const r = await como('admin')
      .patch(`/api/admin/usuarios/${anonima.id}`, { accion: 'REACTIVAR' })
      .expect(409);
    expect(r.body.error.codigo).toBe('CUENTA_ELIMINADA');
  });

  it('ANTI-FUGA: ninguna respuesta trae correos ni hashes', () => {
    for (const t of textos) {
      expect(t).not.toContain('@udistrital.edu.co');
      expect(t).not.toContain('hash_contrasena');
    }
  });
});
