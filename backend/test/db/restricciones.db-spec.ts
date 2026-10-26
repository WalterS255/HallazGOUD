// Pruebas de integración: las reglas de la BD (CHECK, índices únicos, triggers)
// se cumplen también cuando los datos llegan por Prisma, que es como llegarán
// desde la app. Si alguien edita una migración y rompe una regla, esto falla.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { clienteTest, crearPublicacion, crearUsuario, resueltaAhora, unico } from './ayudas.js';

let prisma: PrismaClient;

beforeAll(() => {
  prisma = clienteTest();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('usuario', () => {
  it('rechaza un correo que no es @udistrital.edu.co', async () => {
    await expect(crearUsuario(prisma, { correo: 'alguien@gmail.com' })).rejects.toThrow(
      /chk_usuario_correo_dominio/,
    );
  });

  it('rechaza el mismo correo con otras mayúsculas (índice lower(correo))', async () => {
    const correo = `${unico('ana')}@udistrital.edu.co`;
    await crearUsuario(prisma, { correo });
    await expect(crearUsuario(prisma, { correo: correo.toUpperCase() })).rejects.toThrow(
      /uq_usuario_correo|Unique constraint/,
    );
  });

  it('permite anonimizar a varios usuarios (correo NULL no choca)', async () => {
    for (let i = 0; i < 2; i++) {
      const u = await crearUsuario(prisma);
      await prisma.usuario.update({
        where: { id: u.id },
        data: { nombre: null, correo: null, hash_contrasena: null, estado_cuenta: 'ELIMINADA' },
      });
    }
    const anonimos = await prisma.usuario.count({ where: { correo: null } });
    expect(anonimos).toBeGreaterThanOrEqual(2);
  });
});

describe('publicacion', () => {
  it('rechaza un objeto "perdido en el futuro"', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'PERDIDO' });
    await expect(
      prisma.publicacion.update({
        where: { id: pub.id },
        data: { fecha_suceso: new Date(Date.now() + 86_400_000) },
      }),
    ).rejects.toThrow(/chk_publicacion_fecha_suceso/);
  });

  it('calcula sola la columna busqueda y la búsqueda en español la encuentra', async () => {
    const pub = await crearPublicacion(prisma, {
      tipo: 'ENCONTRADO',
      titulo: 'Calculadora científica',
      descripcion: 'Encontrada en la biblioteca',
    });
    // "calculadoras" (plural) encuentra "Calculadora": el diccionario español reduce a la raíz.
    const filas = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM publicacion
      WHERE id = ${pub.id} AND busqueda @@ plainto_tsquery('spanish', 'calculadoras')`;
    expect(filas).toEqual([{ id: pub.id }]);
  });
});

describe('detalle_reservado', () => {
  it('solo se permite en publicaciones ENCONTRADO (trigger)', async () => {
    const perdido = await crearPublicacion(prisma, { tipo: 'PERDIDO' });
    await expect(
      prisma.detalle_reservado.create({ data: { id_publicacion: perdido.id, texto: 'oculto' } }),
    ).rejects.toThrow(/solo aplica a publicaciones ENCONTRADO/);
  });

  it('se guarda bien en un ENCONTRADO', async () => {
    const encontrado = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    await prisma.detalle_reservado.create({
      data: { id_publicacion: encontrado.id, texto: 'sticker de gato' },
    });
    const detalle = await prisma.detalle_reservado.findUnique({
      where: { id_publicacion: encontrado.id },
    });
    expect(detalle?.texto).toBe('sticker de gato');
  });
});

describe('reclamacion', () => {
  it('solo admite una ACEPTADA por publicación (índice único parcial)', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    const aceptar = async () => {
      const r = await crearUsuario(prisma);
      return prisma.reclamacion.create({
        data: {
          id_publicacion: pub.id,
          id_reclamante: r.id,
          respuesta_detalle: 'un sticker',
          estado: 'ACEPTADA',
          ...resueltaAhora(),
        },
      });
    };
    await aceptar();
    await expect(aceptar()).rejects.toThrow(/Unique constraint|uq_reclamacion_una_aceptada/);
  });

  it('sí admite varias RECHAZADA en la misma publicación', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    const reclamante = await crearUsuario(prisma);
    for (let i = 0; i < 2; i++) {
      await prisma.reclamacion.create({
        data: {
          id_publicacion: pub.id,
          id_reclamante: reclamante.id,
          respuesta_detalle: 'no coincide',
          estado: 'RECHAZADA',
          ...resueltaAhora(),
        },
      });
    }
    expect(await prisma.reclamacion.count({ where: { id_publicacion: pub.id } })).toBe(2);
  });
});

describe('entrega', () => {
  it('no deja poner fecha_entrega si solo confirmó una parte', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    const r = await crearUsuario(prisma);
    const rec = await prisma.reclamacion.create({
      data: {
        id_publicacion: pub.id,
        id_reclamante: r.id,
        respuesta_detalle: 'un sticker',
        estado: 'ACEPTADA',
        ...resueltaAhora(),
      },
    });
    await expect(
      prisma.entrega.create({
        data: { id_reclamacion: rec.id, confirmo_autor: true, fecha_entrega: new Date() },
      }),
    ).rejects.toThrow(/chk_entrega_doble_confirmacion/);
  });
});

describe('auditoria (inmutable)', () => {
  it('se puede insertar, pero no modificar ni borrar', async () => {
    const fila = await prisma.auditoria.create({
      data: { accion: 'PRUEBA', entidad: 'test', detalle: { origen: 'vitest' }, ip: '10.0.0.1' },
    });
    await expect(
      prisma.auditoria.update({ where: { id: fila.id }, data: { accion: 'CAMBIADA' } }),
    ).rejects.toThrow(/inmutable/);
    await expect(prisma.auditoria.delete({ where: { id: fila.id } })).rejects.toThrow(/inmutable/);
  });

  it('rechaza una IP mal escrita (tipo inet)', async () => {
    await expect(
      prisma.auditoria.create({ data: { accion: 'PRUEBA', entidad: 'test', ip: '999.1.1.1' } }),
    ).rejects.toThrow();
  });
});
