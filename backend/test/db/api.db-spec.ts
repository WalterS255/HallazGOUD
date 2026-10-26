// La API de publicaciones, reclamaciones, chat, entrega y estadísticas de punta a punta:
// peticiones HTTP reales (Supertest) → guards → Pipe de Zod → servicios → PostgreSQL real.
// Incluye la prueba ANTI-FUGA de §6.3 sobre todo lo que responde la API.
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configurarApp } from '../../src/configurar-app.js';
import { CorreoService } from '../../src/lib/correo/correo.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { clienteTest, crearUsuario, unico } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;

// Cada respuesta que da la API queda aquí para revisarla al final (anti-fuga).
const respuestas: { ruta: string; quien: string; cuerpo: unknown }[] = [];
const SECRETO = 'SECRETO-sticker-de-gato-en-la-tapa';

type Rol = 'USUARIO' | 'MODERADOR' | 'ADMIN';
const personas: Record<string, { id: number; token: string }> = {};

// Petición con o sin sesión; guarda la respuesta para la revisión anti-fuga.
function como(quien: string | null) {
  const conSesion = (r: request.Test) =>
    quien ? r.set('Authorization', `Bearer ${personas[quien].token}`) : r;
  const anotar = (ruta: string) => (res: request.Response) => {
    respuestas.push({ ruta, quien: quien ?? 'visitante', cuerpo: res.body });
  };
  return {
    get: (ruta: string) => conSesion(http.get(ruta)).expect(anotar(`GET ${ruta}`)),
    post: (ruta: string, cuerpo: object = {}) =>
      conSesion(http.post(ruta).send(cuerpo)).expect(anotar(`POST ${ruta}`)),
    patch: (ruta: string, cuerpo: object) =>
      conSesion(http.patch(ruta).send(cuerpo)).expect(anotar(`PATCH ${ruta}`)),
  };
}

let idEncontrado: number;
let idPerdido: number;

beforeAll(async () => {
  prisma = clienteTest();
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());

  // Tokens firmados con el mismo JwtService (y la misma forma { sub, rol }) que el login.
  const jwt = app.get(JwtService);
  const crear = async (nombre: string, rol: Rol) => {
    const u = await crearUsuario(prisma);
    if (rol !== 'USUARIO') await prisma.usuario.update({ where: { id: u.id }, data: { rol } });
    personas[nombre] = { id: u.id, token: await jwt.signAsync({ sub: u.id, rol }) };
  };
  await crear('autora', 'USUARIO');
  await crear('reclamante', 'USUARIO');
  await crear('curioso', 'USUARIO');
  await crear('admin', 'ADMIN');

  const sede = await prisma.sede.create({ data: { nombre: unico('Sede API ') } });
  const lugar = await prisma.lugar.create({ data: { id_sede: sede.id, edificio: 'Biblioteca' } });
  const cat = await prisma.categoria.create({ data: { nombre: unico('Cat API ') } });
  const ahora = Date.now();
  const base = {
    id_categoria: cat.id,
    id_lugar: lugar.id,
    descripcion: 'Calculadora científica gris',
    fecha_creacion: new Date(ahora),
    fecha_suceso: new Date(ahora - 3_600_000),
  };
  idEncontrado = (
    await prisma.publicacion.create({
      data: {
        ...base,
        id_usuario: personas.autora.id,
        tipo: 'ENCONTRADO',
        titulo: 'Calculadora Casio encontrada',
      },
    })
  ).id;
  await prisma.detalle_reservado.create({ data: { id_publicacion: idEncontrado, texto: SECRETO } });
  idPerdido = (
    await prisma.publicacion.create({
      data: {
        ...base,
        id_usuario: personas.reclamante.id,
        tipo: 'PERDIDO',
        titulo: 'Perdí mi calculadora Casio',
      },
    })
  ).id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('catálogo y detalle (públicos)', () => {
  it('un visitante lista y filtra; la respuesta trae la paginación', async () => {
    const res = await como(null)
      .get(`/api/publicaciones?q=calculadora&tipo=ENCONTRADO&limite=5`)
      .expect(200);
    expect(res.body).toMatchObject({ pagina: 1, limite: 5 });
    expect(res.body.datos.map((d: { id: number }) => d.id)).toContain(idEncontrado);
  });

  it('parámetros inválidos → 400 SOLICITUD_INVALIDA con los detalles por campo', async () => {
    const res = await como(null).get('/api/publicaciones?limite=500&tipo=ROBADO').expect(400);
    expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
    const campos = res.body.error.detalles.map((d: { campo: string }) => d.campo).sort();
    expect(campos).toEqual(['limite', 'tipo']);
  });

  it('el detalle es público; un id inválido es 400 y uno inexistente 404', async () => {
    await como(null).get(`/api/publicaciones/${idEncontrado}`).expect(200);
    await como(null).get('/api/publicaciones/abc').expect(400);
    const res = await como(null).get('/api/publicaciones/999999').expect(404);
    expect(res.body.error.codigo).toBe('PUBLICACION_NO_ENCONTRADA');
  });
});

describe('coincidencias (solo el autor)', () => {
  it('sin sesión 401, otro usuario 403, el autor 200 con su sugerencia', async () => {
    const ruta = `/api/publicaciones/${idPerdido}/coincidencias`;
    expect((await como(null).get(ruta).expect(401)).body.error.codigo).toBe('NO_AUTENTICADO');
    expect((await como('curioso').get(ruta).expect(403)).body.error.codigo).toBe('PROHIBIDO');
    const res = await como('reclamante').get(ruta).expect(200);
    expect(res.body.map((s: { id_publicacion: number }) => s.id_publicacion)).toContain(
      idEncontrado,
    );
  });
});

describe('flujo completo: reclamar → aceptar → conversar → entregar', () => {
  let idReclamacion: number;

  it('reclamar exige sesión y un cuerpo válido', async () => {
    const ruta = `/api/publicaciones/${idEncontrado}/reclamaciones`;
    await como(null).post(ruta, { respuesta_detalle: 'un sticker' }).expect(401);
    await como('reclamante').post(ruta, { respuesta_detalle: '' }).expect(400);
    const res = await como('reclamante')
      .post(ruta, { respuesta_detalle: 'tiene un sticker de gato' })
      .expect(201);
    idReclamacion = res.body.id;
    // La segunda pendiente del mismo usuario choca con el índice único parcial.
    const dup = await como('reclamante').post(ruta, { respuesta_detalle: 'otra vez' }).expect(409);
    expect(dup.body.error.codigo).toBe('RECLAMACION_DUPLICADA');
  });

  it('solo la autora ve las reclamaciones junto al detalle reservado', async () => {
    const ruta = `/api/publicaciones/${idEncontrado}/reclamaciones`;
    await como('curioso').get(ruta).expect(403);
    const res = await como('autora').get(ruta).expect(200);
    expect(res.body.detalle_reservado).toBe(SECRETO);
    expect(res.body.reclamaciones[0].respuesta_detalle).toBe('tiene un sticker de gato');
  });

  it('solo la autora acepta; después la publicación queda EN_RECLAMACION', async () => {
    await como('reclamante')
      .patch(`/api/reclamaciones/${idReclamacion}`, { decision: 'ACEPTAR' })
      .expect(403);
    await como('autora')
      .patch(`/api/reclamaciones/${idReclamacion}`, { decision: 'TAL_VEZ' })
      .expect(400);
    await como('autora')
      .patch(`/api/reclamaciones/${idReclamacion}`, { decision: 'ACEPTAR' })
      .expect(204);
    const pub = await como(null).get(`/api/publicaciones/${idEncontrado}`).expect(200);
    expect(pub.body.estado).toBe('EN_RECLAMACION');
  });

  it('las dos partes conversan; un tercero no', async () => {
    const ruta = `/api/reclamaciones/${idReclamacion}/mensajes`;
    await como('autora')
      .post(ruta, { contenido: '¿Mañana a las 10 en la biblioteca?' })
      .expect(201);
    await como('reclamante').post(ruta, { contenido: '¡Perfecto!' }).expect(201);
    await como('curioso').get(ruta).expect(403);
    const hilo = await como('reclamante').get(ruta).expect(200);
    expect(hilo.body.map((m: { contenido: string }) => m.contenido)).toEqual([
      '¿Mañana a las 10 en la biblioteca?',
      '¡Perfecto!',
    ]);
  });

  it('con las dos confirmaciones la publicación queda ENTREGADA y el chat se cierra', async () => {
    const ruta = `/api/reclamaciones/${idReclamacion}/entrega`;
    expect((await como('autora').post(ruta).expect(200)).body).toEqual({ entregada: false });
    expect((await como('reclamante').post(ruta).expect(200)).body).toEqual({ entregada: true });
    const pub = await como(null).get(`/api/publicaciones/${idEncontrado}`).expect(200);
    expect(pub.body.estado).toBe('ENTREGADA');
    const cerrado = await como('reclamante')
      .post(`/api/reclamaciones/${idReclamacion}/mensajes`, { contenido: 'gracias' })
      .expect(409);
    expect(cerrado.body.error.codigo).toBe('CHAT_CERRADO');
  });
});

describe('estadísticas (solo ADMIN)', () => {
  it('un usuario normal recibe 403; el admin 200; un periodo al revés 400', async () => {
    await como('curioso').get('/api/admin/estadisticas').expect(403);
    const res = await como('admin').get('/api/admin/estadisticas').expect(200);
    expect(res.body).toHaveProperty('recuperacion');
    const malo = await como('admin')
      .get('/api/admin/estadisticas?desde=2026-02-01&hasta=2026-01-01')
      .expect(400);
    expect(malo.body.error.codigo).toBe('PERIODO_INVALIDO');
  });
});

describe('notificaciones (RF-24, RF-25)', () => {
  it('la autora tiene su aviso de reclamación; solo ella puede marcarlo como leído', async () => {
    const res = await como('autora').get('/api/notificaciones').expect(200);
    const reclamacion = res.body.datos.find((n: { tipo: string }) => n.tipo === 'RECLAMACION');
    expect(reclamacion.id_referencia).toBe(idEncontrado);
    expect(res.body.no_leidas).toBeGreaterThan(0);

    // Otra persona no puede tocarla: 404, como si no existiera.
    await como('curioso').patch(`/api/notificaciones/${reclamacion.id}`, {}).expect(404);
    await como('autora').patch(`/api/notificaciones/${reclamacion.id}`, {}).expect(204);
    const despues = await como('autora').get('/api/notificaciones?no_leidas=true').expect(200);
    expect(despues.body.datos.some((n: { id: number }) => n.id === reclamacion.id)).toBe(false);
  });

  it('el reclamante tiene los avisos de aceptación, mensajes y entrega; leer-todas los limpia', async () => {
    const res = await como('reclamante').get('/api/notificaciones').expect(200);
    const tipos = new Set(res.body.datos.map((n: { tipo: string }) => n.tipo));
    expect(tipos).toEqual(new Set(['ESTADO', 'MENSAJE']));
    const r = await como('reclamante').post('/api/notificaciones/leer-todas').expect(200);
    expect(r.body.marcadas).toBeGreaterThan(0);
    const vacia = await como('reclamante').get('/api/notificaciones?no_leidas=true').expect(200);
    expect(vacia.body).toMatchObject({ datos: [], no_leidas: 0 });
  });

  it('sin sesión 401; ?no_leidas inválido 400', async () => {
    await como(null).get('/api/notificaciones').expect(401);
    await como('autora').get('/api/notificaciones?no_leidas=quizas').expect(400);
  });

  it('los correos de aviso salieron, sin el detalle reservado ni el texto del chat', () => {
    const correos = app.get(CorreoService).enviadosEnPrueba;
    expect(correos.length).toBeGreaterThan(0);
    for (const c of correos) {
      expect(c.html + c.texto).not.toContain(SECRETO);
      expect(c.html + c.texto).not.toContain('biblioteca?'); // texto de un mensaje del chat
    }
  });
});

describe('ANTI-FUGA (§6.3): nada sensible sale de la API', () => {
  // Corre al final: revisa TODAS las respuestas que dieron las pruebas anteriores.
  it('ninguna respuesta trae correo, hash ni tokens; el detalle reservado solo lo ve la autora', () => {
    expect(respuestas.length).toBeGreaterThan(20);
    for (const { ruta, quien, cuerpo } of respuestas) {
      const texto = JSON.stringify(cuerpo);
      for (const prohibido of ['@udistrital.edu.co', 'hash_contrasena', 'token_hash', 'correo']) {
        expect(texto, `${quien} → ${ruta}`).not.toContain(prohibido);
      }
      const esLaVistaDeLaAutora = quien === 'autora' && ruta.endsWith('/reclamaciones');
      if (!esLaVistaDeLaAutora) {
        expect(texto, `${quien} → ${ruta}`).not.toContain(SECRETO);
        expect(texto, `${quien} → ${ruta}`).not.toContain('detalle_reservado');
      }
    }
  });
});
