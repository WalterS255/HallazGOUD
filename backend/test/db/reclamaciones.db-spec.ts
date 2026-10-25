// Reclamación y entrega (§6.2, §6.5) contra PostgreSQL real.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuditoriaService } from '../../src/lib/auditoria/auditoria.service.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { PublicacionesRepository } from '../../src/modules/publicaciones/publicaciones.repository.js';
import { PublicacionesService } from '../../src/modules/publicaciones/publicaciones.service.js';
import { ReclamacionesRepository } from '../../src/modules/reclamaciones/reclamaciones.repository.js';
import { ReclamacionesService } from '../../src/modules/reclamaciones/reclamaciones.service.js';
import { clienteTest, crearPublicacion, crearUsuario } from './ayudas.js';

let prisma: PrismaClient;
let servicio: ReclamacionesService;

beforeAll(() => {
  prisma = clienteTest();
  const bd = prisma as unknown as PrismaService;
  const auditoria = new AuditoriaService(bd);
  const publicaciones = new PublicacionesService(new PublicacionesRepository(bd), auditoria);
  servicio = new ReclamacionesService(new ReclamacionesRepository(bd), publicaciones, auditoria);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Un ENCONTRADO con su detalle reservado, su autor y dos posibles reclamantes.
async function escenario() {
  const autor = await crearUsuario(prisma);
  const [ana, beto] = [await crearUsuario(prisma), await crearUsuario(prisma)];
  const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO', id_usuario: autor.id });
  await prisma.detalle_reservado.create({
    data: { id_publicacion: pub.id, texto: 'sticker de gato' },
  });
  const reclamar = (id: number, respuesta = 'tiene un sticker de gato') =>
    servicio.crear({ id_publicacion: pub.id, id_reclamante: id, respuesta_detalle: respuesta });
  return { autor, ana, beto, pub, reclamar };
}
const estadoPub = async (id: number) =>
  (await prisma.publicacion.findUniqueOrThrow({ where: { id } })).estado;
const reclamacion = (id: number) => prisma.reclamacion.findUniqueOrThrow({ where: { id } });

describe('crear reclamación', () => {
  it('rechaza reclamar lo propio y reclamar un PERDIDO', async () => {
    const { autor, reclamar } = await escenario();
    await expect(reclamar(autor.id)).rejects.toMatchObject({ codigo: 'RECLAMACION_PROPIA' });

    const perdido = await crearPublicacion(prisma, { tipo: 'PERDIDO' });
    const alguien = await crearUsuario(prisma);
    await expect(
      servicio.crear({
        id_publicacion: perdido.id,
        id_reclamante: alguien.id,
        respuesta_detalle: 'es mío',
      }),
    ).rejects.toMatchObject({ codigo: 'NO_RECLAMABLE' });
  });

  it('dos pendientes del mismo usuario a la vez → solo una entra (índice único parcial)', async () => {
    const { ana, reclamar } = await escenario();
    const res = await Promise.allSettled([reclamar(ana.id), reclamar(ana.id)]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (res.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason,
    ).toMatchObject({ codigo: 'RECLAMACION_DUPLICADA' });
  });
});

describe('el autor revisa (RF-19)', () => {
  it('el autor ve las respuestas junto al detalle reservado; otro usuario no', async () => {
    const { autor, ana, pub, reclamar } = await escenario();
    await reclamar(ana.id);
    const vista = await servicio.paraElAutor(pub.id, autor.id);
    expect(vista.detalle_reservado).toBe('sticker de gato');
    expect(vista.reclamaciones[0]).toMatchObject({ respuesta_detalle: 'tiene un sticker de gato' });
    expect(Object.keys(vista.reclamaciones[0].reclamante).sort()).toEqual(['id', 'nombre']);

    await expect(servicio.paraElAutor(pub.id, ana.id)).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
  });
});

describe('aceptar y rechazar', () => {
  it('ACEPTAR: reclamación ACEPTADA, publicación EN_RECLAMACION, entrega vacía; las demás siguen PENDIENTE', async () => {
    const { autor, ana, beto, pub, reclamar } = await escenario();
    const ra = await reclamar(ana.id);
    const rb = await reclamar(beto.id, 'es azul');
    await servicio.resolver(ra.id, autor.id, 'ACEPTAR');

    const a = await reclamacion(ra.id);
    expect(a.estado).toBe('ACEPTADA');
    expect(a.fecha_resolucion!.getTime()).toBeGreaterThanOrEqual(a.fecha.getTime());
    expect(await estadoPub(pub.id)).toBe('EN_RECLAMACION');
    expect(await prisma.entrega.findUnique({ where: { id_reclamacion: ra.id } })).toMatchObject({
      confirmo_autor: false,
      confirmo_reclamante: false,
      fecha_entrega: null,
    });
    expect((await reclamacion(rb.id)).estado).toBe('PENDIENTE');
    expect(
      await prisma.auditoria.count({
        where: { accion: 'RECLAMACION_ACEPTADA', id_entidad: ra.id },
      }),
    ).toBe(1);
  });

  it('dos aceptaciones simultáneas de reclamaciones DISTINTAS → gana una y la otra se deshace entera', async () => {
    const { autor, ana, beto, pub, reclamar } = await escenario();
    const [ra, rb] = [await reclamar(ana.id), await reclamar(beto.id)];
    const res = await Promise.allSettled([
      servicio.resolver(ra.id, autor.id, 'ACEPTAR'),
      servicio.resolver(rb.id, autor.id, 'ACEPTAR'),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const estados = [(await reclamacion(ra.id)).estado, (await reclamacion(rb.id)).estado].sort();
    // La perdedora NO quedó ACEPTADA a medias: su UPDATE se deshizo con la transacción.
    expect(estados).toEqual(['ACEPTADA', 'PENDIENTE']);
    expect(await prisma.entrega.count({ where: { reclamacion: { id_publicacion: pub.id } } })).toBe(
      1,
    );
  });

  it('RECHAZAR deja la publicación ACTIVA; resolverla otra vez o siendo otro usuario falla', async () => {
    const { autor, ana, pub, reclamar } = await escenario();
    const r = await reclamar(ana.id);
    await expect(servicio.resolver(r.id, ana.id, 'ACEPTAR')).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
    await servicio.resolver(r.id, autor.id, 'RECHAZAR');
    expect((await reclamacion(r.id)).estado).toBe('RECHAZADA');
    expect(await estadoPub(pub.id)).toBe('ACTIVA');
    await expect(servicio.resolver(r.id, autor.id, 'ACEPTAR')).rejects.toMatchObject({
      codigo: 'RECLAMACION_RESUELTA',
    });
  });
});

describe('entrega con doble confirmación (§6.5)', () => {
  it('con una confirmación no se entrega; con las dos sí, y después queda cerrada', async () => {
    const { autor, ana, beto, pub, reclamar } = await escenario();
    const r = await reclamar(ana.id);
    await servicio.resolver(r.id, autor.id, 'ACEPTAR');

    await expect(servicio.confirmarEntrega(r.id, beto.id)).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
    await expect(servicio.confirmarEntrega(r.id, autor.id)).resolves.toEqual({ entregada: false });
    // Confirmar dos veces la misma parte no adelanta nada.
    await expect(servicio.confirmarEntrega(r.id, autor.id)).resolves.toEqual({ entregada: false });
    expect(await estadoPub(pub.id)).toBe('EN_RECLAMACION');

    await expect(servicio.confirmarEntrega(r.id, ana.id)).resolves.toEqual({ entregada: true });
    expect(await estadoPub(pub.id)).toBe('ENTREGADA');
    const e = await prisma.entrega.findUniqueOrThrow({ where: { id_reclamacion: r.id } });
    expect(e.fecha_entrega).not.toBeNull();

    await expect(servicio.confirmarEntrega(r.id, ana.id)).rejects.toMatchObject({
      codigo: 'ENTREGA_CERRADA',
    });
  });

  it('las dos partes confirman EN EL MISMO INSTANTE → se entrega una sola vez', async () => {
    const { autor, ana, pub, reclamar } = await escenario();
    const r = await reclamar(ana.id);
    await servicio.resolver(r.id, autor.id, 'ACEPTAR');
    const res = await Promise.all([
      servicio.confirmarEntrega(r.id, autor.id),
      servicio.confirmarEntrega(r.id, ana.id),
    ]);
    // Sin el FOR UPDATE, cada una leería "la otra no ha confirmado" y nadie cerraría.
    expect(res.filter((x) => x.entregada)).toHaveLength(1); // una cierra, la otra no
    expect(await estadoPub(pub.id)).toBe('ENTREGADA');
  });
});
