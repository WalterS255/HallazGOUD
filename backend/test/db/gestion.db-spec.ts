// Crear, editar y retirar publicaciones (RF-06, RF-07, RF-09, RF-10) por HTTP,
// contra PostgreSQL real (hallazgo_test).
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { clienteTest, crearLugar, crearUsuario, unico } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;
let lugar: { id: number };
let categoria: { id: number };
let categoriaSensible: { id: number };

beforeAll(async () => {
  prisma = clienteTest();
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());

  lugar = await crearLugar(prisma);
  categoria = await prisma.categoria.create({ data: { nombre: unico('Cat ') } });
  categoriaSensible = await prisma.categoria.create({
    data: { nombre: unico('Documentos '), sensible: true },
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

// Una persona con sesión: crea el usuario y firma su JWT (lo mismo que haría el login).
async function persona(rol: 'USUARIO' | 'MODERADOR' | 'ADMIN' = 'USUARIO') {
  const u = await crearUsuario(prisma);
  if (rol !== 'USUARIO') await prisma.usuario.update({ where: { id: u.id }, data: { rol } });
  const token = await app.get(JwtService).signAsync({ sub: u.id, rol });
  return { id: u.id, auth: `Bearer ${token}` };
}

const haceUnaHora = () => new Date(Date.now() - 3_600_000).toISOString();

function encontrado(extra: Record<string, unknown> = {}) {
  return {
    tipo: 'ENCONTRADO',
    titulo: 'Audífonos negros',
    descripcion: 'Audífonos inalámbricos en su estuche',
    id_categoria: categoria.id,
    id_lugar: lugar.id,
    fecha_suceso: haceUnaHora(),
    detalle_reservado: 'Sticker de gato en el estuche',
    ...extra,
  };
}

async function crearComo(quien: { auth: string }, datos = encontrado()) {
  const res = await http.post('/api/publicaciones').set('Authorization', quien.auth).send(datos);
  return res;
}

describe('POST /api/publicaciones', () => {
  it('crea un ENCONTRADO con su detalle reservado, historial y auditoría', async () => {
    const ana = await persona();
    const res = await crearComo(ana);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tipo: 'ENCONTRADO', estado: 'ACTIVA', aviso_sensible: false });
    // Regla 6.3: la respuesta NUNCA trae el detalle reservado.
    expect(JSON.stringify(res.body)).not.toMatch(/detalle_reservado|Sticker de gato/);

    const id = res.body.id as number;
    const detalle = await prisma.detalle_reservado.findUnique({ where: { id_publicacion: id } });
    expect(detalle?.texto).toBe('Sticker de gato en el estuche');

    const historial = await prisma.historial_estado.findMany({ where: { id_publicacion: id } });
    expect(historial).toEqual([
      expect.objectContaining({
        estado_anterior: null,
        estado_nuevo: 'ACTIVA',
        id_usuario: ana.id,
      }),
    ]);
    const auditoria = await prisma.auditoria.findFirst({
      where: { entidad: 'publicacion', id_entidad: id, accion: 'PUBLICACION_CREADA' },
    });
    expect(auditoria?.detalle).toEqual({ tipo: 'ENCONTRADO' });
  });

  it('un PERDIDO no guarda detalle reservado', async () => {
    const res = await crearComo(
      await persona(),
      encontrado({ tipo: 'PERDIDO', detalle_reservado: undefined }),
    );
    expect(res.status).toBe(201);
    expect(await prisma.detalle_reservado.count({ where: { id_publicacion: res.body.id } })).toBe(
      0,
    );
  });

  it('categoría sensible → aviso_sensible: true (regla 6.6)', async () => {
    const res = await crearComo(
      await persona(),
      encontrado({ id_categoria: categoriaSensible.id }),
    );
    expect(res.body.aviso_sensible).toBe(true);
  });

  it('sin sesión → 401', async () => {
    await http.post('/api/publicaciones').send(encontrado()).expect(401);
  });

  it('fecha futura → 400 con el campo fecha_suceso marcado', async () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString();
    const res = await crearComo(await persona(), encontrado({ fecha_suceso: manana }));
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'fecha_suceso', mensaje: 'La fecha no puede estar en el futuro' },
    ]);
  });

  it('reloj del celular 3 min adelantado → se publica con fecha_suceso = fecha_creacion', async () => {
    const adelantada = new Date(Date.now() + 3 * 60_000).toISOString();
    const res = await crearComo(await persona(), encontrado({ fecha_suceso: adelantada }));
    expect(res.status).toBe(201);
    // Sin el ajuste, el CHECK fecha_suceso <= fecha_creacion la habría rechazado.
    const p = await prisma.publicacion.findUniqueOrThrow({
      where: { id: res.body.id },
      select: { fecha_suceso: true, fecha_creacion: true },
    });
    expect(p.fecha_suceso.getTime()).toBe(p.fecha_creacion.getTime());
  });

  it('categoría inactiva o lugar inexistente → 400 con el campo marcado', async () => {
    const inactiva = await prisma.categoria.create({
      data: { nombre: unico('Vieja '), activa: false },
    });
    const yo = await persona();
    const r1 = await crearComo(yo, encontrado({ id_categoria: inactiva.id }));
    expect(r1.body.error.detalles[0].campo).toBe('id_categoria');
    const r2 = await crearComo(yo, encontrado({ id_lugar: 999_999 }));
    expect(r2.body.error.detalles[0].campo).toBe('id_lugar');
  });
});

describe('POST /api/publicaciones con sede + ubicación (2026-11-24)', () => {
  it('queda en el lugar "General" de la sede (uno solo por sede) y guarda la ubicación', async () => {
    const sede = await prisma.sede.create({ data: { nombre: unico('Sede ') } });
    const datos = encontrado({
      id_lugar: undefined,
      id_sede: sede.id,
      ubicacion: 'Cuarto piso, al lado de una mesa',
    });
    const yo = await persona();
    const r1 = await crearComo(yo, datos);
    const r2 = await crearComo(yo, datos);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({
      ubicacion: 'Cuarto piso, al lado de una mesa',
      lugar: { edificio: 'General', sede: { id: sede.id } },
    });
    expect(r2.body.lugar.id).toBe(r1.body.lugar.id);
    expect(await prisma.lugar.count({ where: { id_sede: sede.id } })).toBe(1);
  });

  it('sede inexistente → 400 con id_sede marcado', async () => {
    const res = await crearComo(
      await persona(),
      encontrado({ id_lugar: undefined, id_sede: 999_999, ubicacion: 'Piso 4' }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'id_sede', mensaje: 'Elige una sede válida' },
    ]);
  });

  it('al editar, cambiar de sede y de ubicación', async () => {
    const ana = await persona();
    const { body } = await crearComo(ana);
    const sede = await prisma.sede.create({ data: { nombre: unico('Sede ') } });
    const res = await http
      .put(`/api/publicaciones/${body.id}`)
      .set('Authorization', ana.auth)
      .send({ id_sede: sede.id, ubicacion: 'Cafetería, mesa del fondo' })
      .expect(200);
    expect(res.body).toMatchObject({
      ubicacion: 'Cafetería, mesa del fondo',
      lugar: { edificio: 'General', sede: { id: sede.id } },
    });
  });
});

describe('PUT /api/publicaciones/:id', () => {
  it('el autor edita; cuenta como actividad (ultima_actividad avanza)', async () => {
    const ana = await persona();
    const { body } = await crearComo(ana);
    const antes = await prisma.publicacion.findUniqueOrThrow({ where: { id: body.id } });

    const res = await http
      .put(`/api/publicaciones/${body.id}`)
      .set('Authorization', ana.auth)
      .send({ titulo: 'Audífonos Sony negros' })
      .expect(200);
    expect(res.body.titulo).toBe('Audífonos Sony negros');
    const despues = await prisma.publicacion.findUniqueOrThrow({ where: { id: body.id } });
    expect(despues.ultima_actividad.getTime()).toBeGreaterThan(antes.ultima_actividad.getTime());
  });

  it('otra persona → 403 PROHIBIDO', async () => {
    const { body } = await crearComo(await persona());
    const res = await http
      .put(`/api/publicaciones/${body.id}`)
      .set('Authorization', (await persona()).auth)
      .send({ titulo: 'Esto es mío ahora' })
      .expect(403);
    expect(res.body.error.codigo).toBe('PROHIBIDO');
  });

  it('con reclamaciones, el detalle reservado ya no se puede cambiar (409)', async () => {
    const ana = await persona();
    const { body } = await crearComo(ana);
    const beto = await persona();
    await prisma.reclamacion.create({
      data: { id_publicacion: body.id, id_reclamante: beto.id, respuesta_detalle: 'un sticker' },
    });
    const res = await http
      .put(`/api/publicaciones/${body.id}`)
      .set('Authorization', ana.auth)
      .send({ detalle_reservado: 'Ahora digo que es un perro' })
      .expect(409);
    expect(res.body.error.codigo).toBe('DETALLE_BLOQUEADO');
  });

  it('una ENTREGADA no se edita (RF-10) → 409', async () => {
    const ana = await persona();
    const { body } = await crearComo(ana);
    await prisma.publicacion.update({ where: { id: body.id }, data: { estado: 'ENTREGADA' } });
    const res = await http
      .put(`/api/publicaciones/${body.id}`)
      .set('Authorization', ana.auth)
      .send({ titulo: 'Cambio tarde' })
      .expect(409);
    expect(res.body.error.codigo).toBe('PUBLICACION_NO_EDITABLE');
  });

  it('id que no es número → 400; id que no existe → 404', async () => {
    const yo = await persona();
    await http
      .put('/api/publicaciones/abc')
      .set('Authorization', yo.auth)
      .send({ titulo: 'Hola mundo' })
      .expect(400);
    await http
      .put('/api/publicaciones/999999')
      .set('Authorization', yo.auth)
      .send({ titulo: 'Hola mundo' })
      .expect(404);
  });
});

describe('DELETE /api/publicaciones/:id (retirar)', () => {
  it('otro usuario → 403; un moderador sí puede, y queda en el historial', async () => {
    const { body } = await crearComo(await persona());
    await http
      .delete(`/api/publicaciones/${body.id}`)
      .set('Authorization', (await persona()).auth)
      .expect(403);

    const moderador = await persona('MODERADOR');
    const res = await http
      .delete(`/api/publicaciones/${body.id}`)
      .set('Authorization', moderador.auth)
      .expect(200);
    expect(res.body).toEqual({ id: body.id, estado: 'RETIRADA' });

    const ultimo = await prisma.historial_estado.findFirst({
      where: { id_publicacion: body.id },
      orderBy: { id: 'desc' },
    });
    expect(ultimo).toMatchObject({
      estado_anterior: 'ACTIVA',
      estado_nuevo: 'RETIRADA',
      id_usuario: moderador.id,
      motivo: 'Retirada por moderación',
    });
    // La fila NO se borra: solo cambia de estado.
    expect(await prisma.publicacion.count({ where: { id: body.id } })).toBe(1);
  });

  it('retirar dos veces → 409 TRANSICION_INVALIDA (RETIRADA es final)', async () => {
    const ana = await persona();
    const { body } = await crearComo(ana);
    await http.delete(`/api/publicaciones/${body.id}`).set('Authorization', ana.auth).expect(200);
    const res = await http
      .delete(`/api/publicaciones/${body.id}`)
      .set('Authorization', ana.auth)
      .expect(409);
    expect(res.body.error.codigo).toBe('TRANSICION_INVALIDA');
  });
});
