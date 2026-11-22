// Registro, verificación, login, bloqueo y recuperación (RF-01 a RF-05, regla 6.7)
// de punta a punta: peticiones HTTP reales (Supertest) contra PostgreSQL real
// (hallazgo_test). Los correos no se envían: CorreoService los guarda en memoria
// (NODE_ENV=test) y de ahí se sacan los enlaces, como haría la persona en Mailpit.
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { config } from '../../src/config/configuracion.js';
import { configurarApp } from '../../src/configurar-app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { CorreoService } from '../../src/lib/correo/correo.service.js';
import { clienteTest, unico } from './ayudas.js';

let prisma: PrismaClient;
let app: NestExpressApplication;
let http: ReturnType<typeof request>;

// Cada app nueva arranca con los contadores del rate limit en cero.
async function nuevaApp() {
  if (app) await app.close();
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  http = request(app.getHttpServer());
}

const ultimoCorreo = () => app.get(CorreoService).enviadosEnPrueba.at(-1);
// El token va al final del enlace: …/verificar/<64 hex>
const tokenDelCorreo = () => ultimoCorreo()!.texto.match(/[0-9a-f]{64}/)![0];

function datosRegistro(correo = `${unico('ana')}@udistrital.edu.co`) {
  return {
    nombre: 'Ana Pérez',
    correo,
    programa: 'Ingeniería de Sistemas',
    contrasena: 'clave1234',
    aceptaPolitica: true,
  };
}

// Registra y activa una cuenta; devuelve su correo y contraseña.
async function cuentaActiva() {
  const d = datosRegistro();
  await http.post('/api/auth/registro').send(d).expect(201);
  await http.get(`/api/auth/verificar/${tokenDelCorreo()}`).expect(200);
  return d;
}

beforeAll(() => {
  prisma = clienteTest();
});
beforeEach(nuevaApp);
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('registro y verificación (RF-01, RF-02)', () => {
  it('crea la cuenta sin verificar, con hash bcrypt, y envía el enlace', async () => {
    const d = datosRegistro();
    const res = await http.post('/api/auth/registro').send(d).expect(201);
    expect(res.body).toEqual({ mensaje: 'Te enviamos un correo para activar tu cuenta.' });

    const u = await prisma.usuario.findFirstOrThrow({ where: { correo: d.correo } });
    expect(u.verificado).toBe(false);
    // bcrypt con el coste CONFIGURADO (12 en el .env, 10 en el CI): la prueba no debe
    // depender del .env de nadie. Lo que exige RNF-06 es que sea al menos 10.
    const coste = String(config.bcryptCoste).padStart(2, '0');
    expect(u.hash_contrasena?.startsWith(`$2b$${coste}$`)).toBe(true);
    expect(config.bcryptCoste).toBeGreaterThanOrEqual(10);
    expect(u.hash_contrasena).not.toContain(d.contrasena);
    expect(u.acepto_politica_en).toBeInstanceOf(Date); // Ley 1581

    expect(ultimoCorreo()!.para).toBe(d.correo);
    // En la BD está el HASH del token, nunca el token que viaja en el correo.
    const token = tokenDelCorreo();
    const guardados = await prisma.token_usuario.findMany({ where: { id_usuario: u.id } });
    expect(guardados).toHaveLength(1);
    expect(guardados[0]!.token_hash).not.toBe(token);
  });

  it('el mismo correo con otras mayúsculas → 409 CORREO_REGISTRADO', async () => {
    const d = datosRegistro();
    await http.post('/api/auth/registro').send(d).expect(201);
    const res = await http
      .post('/api/auth/registro')
      .send({ ...d, correo: d.correo.toUpperCase() })
      .expect(409);
    expect(res.body.error.codigo).toBe('CORREO_REGISTRADO');
  });

  it('el enlace activa la cuenta y solo sirve una vez', async () => {
    const d = datosRegistro();
    await http.post('/api/auth/registro').send(d).expect(201);
    const token = tokenDelCorreo();
    await http.get(`/api/auth/verificar/${token}`).expect(200);
    const u = await prisma.usuario.findFirstOrThrow({ where: { correo: d.correo } });
    expect(u.verificado).toBe(true);

    const res = await http.get(`/api/auth/verificar/${token}`).expect(400);
    expect(res.body.error.codigo).toBe('TOKEN_USADO');
  });

  it('un enlace inventado → 400 TOKEN_INVALIDO; uno mal formado → 400 SOLICITUD_INVALIDA', async () => {
    const r1 = await http.get(`/api/auth/verificar/${'f'.repeat(64)}`).expect(400);
    expect(r1.body.error.codigo).toBe('TOKEN_INVALIDO');
    const r2 = await http.get('/api/auth/verificar/abc').expect(400);
    expect(r2.body.error.codigo).toBe('SOLICITUD_INVALIDA');
  });
});

describe('login y sesión (RF-03, regla 6.7)', () => {
  it('sin verificar → 403 CUENTA_NO_VERIFICADA (solo con la contraseña correcta)', async () => {
    const d = datosRegistro();
    await http.post('/api/auth/registro').send(d).expect(201);
    const res = await http
      .post('/api/auth/login')
      .send({ correo: d.correo, contrasena: d.contrasena })
      .expect(403);
    expect(res.body.error.codigo).toBe('CUENTA_NO_VERIFICADA');
  });

  it('login correcto → JWT; con él, /usuarios/me devuelve el perfil SIN hash', async () => {
    const d = await cuentaActiva();
    const res = await http
      .post('/api/auth/login')
      .send({ correo: `  ${d.correo.toUpperCase()} `, contrasena: d.contrasena })
      .expect(200);
    expect(res.body.usuario).toEqual({
      id: expect.any(Number),
      nombre: 'Ana Pérez',
      rol: 'USUARIO',
    });

    const yo = await http
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
    expect(yo.body.correo).toBe(d.correo);
    expect(JSON.stringify(yo.body)).not.toMatch(/hash_contrasena|\$2[aby]\$/);
  });

  it('/usuarios/me sin sesión → 401; con un token alterado → 401 SESION_INVALIDA', async () => {
    const d = await cuentaActiva();
    const { body } = await http
      .post('/api/auth/login')
      .send({ correo: d.correo, contrasena: d.contrasena });

    await http.get('/api/usuarios/me').expect(401);

    // Cambiar UNA letra de la firma basta para que el token deje de valer.
    const t: string = body.token;
    const alterado = t.slice(0, -2) + (t.at(-2) === 'a' ? 'b' : 'a') + t.at(-1);
    const res = await http
      .get('/api/usuarios/me')
      .set('Authorization', `Bearer ${alterado}`)
      .expect(401);
    expect(res.body.error.codigo).toBe('SESION_INVALIDA');
  });

  it('el mismo mensaje si el correo no existe o si la contraseña está mal', async () => {
    const d = await cuentaActiva();
    const noExiste = await http
      .post('/api/auth/login')
      .send({ correo: 'nadie@udistrital.edu.co', contrasena: 'x' })
      .expect(401);
    const malaClave = await http
      .post('/api/auth/login')
      .send({ correo: d.correo, contrasena: 'equivocada1' })
      .expect(401);
    expect(noExiste.body).toEqual(malaClave.body);
    expect(noExiste.body.error.mensaje).toBe('Correo o contraseña incorrectos.');
  });

  it('5 fallos bloquean la cuenta: luego, ni la contraseña correcta entra (423)', async () => {
    const d = await cuentaActiva();
    await nuevaApp(); // contador del rate limit en cero: aquí se prueba el bloqueo POR CUENTA
    for (let i = 1; i <= 5; i++) {
      await http
        .post('/api/auth/login')
        .send({ correo: d.correo, contrasena: `mala${i}xx` })
        .expect(401);
    }
    const u = await prisma.usuario.findFirstOrThrow({ where: { correo: d.correo } });
    expect(u.bloqueado_hasta!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);

    await nuevaApp(); // una IP "nueva" (el rate limit no influye): el bloqueo sigue en la BD
    const res = await http
      .post('/api/auth/login')
      .send({ correo: d.correo, contrasena: d.contrasena })
      .expect(423);
    expect(res.body.error.codigo).toBe('CUENTA_BLOQUEADA');

    const acciones = await prisma.auditoria.groupBy({
      by: ['accion'],
      where: { entidad: 'usuario', id_entidad: u.id },
      _count: true,
    });
    const cuenta = Object.fromEntries(acciones.map((a) => [a.accion, a._count]));
    expect(cuenta).toMatchObject({ LOGIN_FALLIDO: 5, CUENTA_BLOQUEADA: 1 });
  });

  it('el rate limit corta el 6.º intento por minuto desde la misma IP (429)', async () => {
    for (let i = 1; i <= 5; i++) {
      await http.post('/api/auth/login').send({ correo: 'x@udistrital.edu.co', contrasena: 'x' });
    }
    await http
      .post('/api/auth/login')
      .send({ correo: 'x@udistrital.edu.co', contrasena: 'x' })
      .expect(429);
  });
});

describe('recuperación de contraseña (RF-04)', () => {
  it('responde lo mismo exista o no el correo, y solo envía si existe', async () => {
    const d = await cuentaActiva();
    const enviados = () => app.get(CorreoService).enviadosEnPrueba.length;

    const antes = enviados();
    const noExiste = await http
      .post('/api/auth/recuperar')
      .send({ correo: 'nadie@udistrital.edu.co' })
      .expect(202);
    expect(enviados()).toBe(antes);

    const existe = await http.post('/api/auth/recuperar').send({ correo: d.correo }).expect(202);
    expect(enviados()).toBe(antes + 1);
    expect(existe.body).toEqual(noExiste.body);
  });

  it('restablecer cambia la contraseña, el enlace no se reutiliza y la vieja deja de servir', async () => {
    const d = await cuentaActiva();
    await http.post('/api/auth/recuperar').send({ correo: d.correo }).expect(202);
    const token = tokenDelCorreo();

    await http.post('/api/auth/restablecer').send({ token, contrasena: 'nueva5678' }).expect(200);
    const otraVez = await http
      .post('/api/auth/restablecer')
      .send({ token, contrasena: 'otra9999' })
      .expect(400);
    expect(otraVez.body.error.codigo).toBe('TOKEN_USADO');

    await nuevaApp();
    await http
      .post('/api/auth/login')
      .send({ correo: d.correo, contrasena: d.contrasena })
      .expect(401);
    await http
      .post('/api/auth/login')
      .send({ correo: d.correo, contrasena: 'nueva5678' })
      .expect(200);
  });

  it('un token de VERIFICACIÓN no sirve para restablecer', async () => {
    const d = datosRegistro();
    await http.post('/api/auth/registro').send(d).expect(201);
    const res = await http
      .post('/api/auth/restablecer')
      .send({ token: tokenDelCorreo(), contrasena: 'nueva5678' })
      .expect(400);
    expect(res.body.error.codigo).toBe('TOKEN_INVALIDO');
  });
});
