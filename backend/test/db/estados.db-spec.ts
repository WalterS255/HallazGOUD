// cambiarEstado contra PostgreSQL real: lo que una prueba unitaria NO puede demostrar.
//   * Atomicidad: si la auditoría falla, tampoco se guarda el estado ni el historial.
//   * Bloqueo: dos cambios simultáneos sobre la misma publicación no se pisan.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuditoriaService } from '../../src/lib/auditoria/auditoria.service.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { PublicacionesRepository } from '../../src/modules/publicaciones/publicaciones.repository.js';
import { PublicacionesService } from '../../src/modules/publicaciones/publicaciones.service.js';
import { clienteTest, crearPublicacion } from './ayudas.js';

let prisma: PrismaClient;
let servicio: PublicacionesService;

const historialDe = (id: number) =>
  prisma.historial_estado.findMany({ where: { id_publicacion: id }, orderBy: { id: 'asc' } });
const auditoriaDe = (id: number) =>
  prisma.auditoria.findMany({ where: { entidad: 'publicacion', id_entidad: id } });

beforeAll(() => {
  prisma = clienteTest();
  const bd = prisma as unknown as PrismaService;
  servicio = new PublicacionesService(new PublicacionesRepository(bd), new AuditoriaService(bd));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PublicacionesService.cambiarEstado (BD real)', () => {
  it('un cambio válido escribe estado, historial y auditoría', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    await servicio.cambiarEstado(pub.id, 'EN_RECLAMACION', { id_usuario: pub.id_usuario });

    const guardada = await prisma.publicacion.findUniqueOrThrow({ where: { id: pub.id } });
    expect(guardada.estado).toBe('EN_RECLAMACION');
    expect(guardada.ultima_actividad.getTime()).toBeGreaterThan(pub.ultima_actividad.getTime());

    const [h] = await historialDe(pub.id);
    expect(h).toMatchObject({
      estado_anterior: 'ACTIVA',
      estado_nuevo: 'EN_RECLAMACION',
      motivo: 'Reclamación aceptada',
    });
    const [a] = await auditoriaDe(pub.id);
    expect(a).toMatchObject({ accion: 'PUBLICACION_CAMBIO_ESTADO', id_usuario: pub.id_usuario });
    expect(a.detalle).toEqual({
      desde: 'ACTIVA',
      hacia: 'EN_RECLAMACION',
      motivo: 'Reclamación aceptada',
    });
  });

  it('una transición inválida no escribe nada', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    await expect(
      servicio.cambiarEstado(pub.id, 'ENTREGADA', { id_usuario: null }),
    ).rejects.toMatchObject({ codigo: 'TRANSICION_INVALIDA' });
    expect((await prisma.publicacion.findUniqueOrThrow({ where: { id: pub.id } })).estado).toBe(
      'ACTIVA',
    );
    expect(await historialDe(pub.id)).toEqual([]);
  });

  it('ATOMICIDAD: si la auditoría falla, se deshace también el estado y el historial', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    const bd = prisma as unknown as PrismaService;
    const auditoriaRota = {
      registrar: async () => {
        throw new Error('fallo simulado al escribir la auditoría');
      },
    } as unknown as AuditoriaService;
    const conFallo = new PublicacionesService(new PublicacionesRepository(bd), auditoriaRota);

    await expect(conFallo.cambiarEstado(pub.id, 'RETIRADA', { id_usuario: null })).rejects.toThrow(
      /fallo simulado/,
    );
    // El UPDATE y el INSERT del historial SÍ se ejecutaron… pero la transacción los deshizo.
    expect((await prisma.publicacion.findUniqueOrThrow({ where: { id: pub.id } })).estado).toBe(
      'ACTIVA',
    );
    expect(await historialDe(pub.id)).toEqual([]);
  });

  it('BLOQUEO: dos cambios simultáneos desde ACTIVA → solo uno gana', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    // El cron expira y el autor retira EN EL MISMO INSTANTE.
    const resultados = await Promise.allSettled([
      servicio.cambiarEstado(pub.id, 'EXPIRADA', { id_usuario: null }),
      servicio.cambiarEstado(pub.id, 'RETIRADA', { id_usuario: pub.id_usuario }),
    ]);

    const ganadores = resultados.filter((r) => r.status === 'fulfilled');
    const perdedores = resultados.filter((r) => r.status === 'rejected');
    expect(ganadores).toHaveLength(1);
    expect(perdedores).toHaveLength(1);
    // El segundo esperó el bloqueo, vio el estado YA final y fue rechazado.
    expect((perdedores[0] as PromiseRejectedResult).reason).toMatchObject({
      codigo: 'TRANSICION_INVALIDA',
    });
    // Un solo cambio en el historial: sin el FOR UPDATE habría dos.
    expect(await historialDe(pub.id)).toHaveLength(1);
  });

  it('el ciclo completo ACTIVA → EN_RECLAMACION → ACTIVA → EN_RECLAMACION → ENTREGADA', async () => {
    const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
    for (const hacia of ['EN_RECLAMACION', 'ACTIVA', 'EN_RECLAMACION', 'ENTREGADA'] as const) {
      await servicio.cambiarEstado(pub.id, hacia, { id_usuario: pub.id_usuario });
    }
    const pasos = (await historialDe(pub.id)).map((h) => `${h.estado_anterior}→${h.estado_nuevo}`);
    expect(pasos).toEqual([
      'ACTIVA→EN_RECLAMACION',
      'EN_RECLAMACION→ACTIVA',
      'ACTIVA→EN_RECLAMACION',
      'EN_RECLAMACION→ENTREGADA',
    ]);
  });
});
