// Expiración a 90 días (RF-12) contra la BD real, con casos límite.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { ExpiracionService } from '../../src/jobs/expiracion.service.js';
import { AuditoriaService } from '../../src/lib/auditoria/auditoria.service.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { PublicacionesRepository } from '../../src/modules/publicaciones/publicaciones.repository.js';
import { PublicacionesService } from '../../src/modules/publicaciones/publicaciones.service.js';
import { clienteTest, crearPublicacion } from './ayudas.js';

let prisma: PrismaClient;
let expiracion: ExpiracionService;

// Pone ultima_actividad hace N días usando el reloj de la BD (now()), igual que la tarea.
async function inactivaHace(dias: number, estado: 'ACTIVA' | 'EN_RECLAMACION' = 'ACTIVA') {
  const pub = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
  await prisma.$executeRaw`
    UPDATE publicacion
    SET ultima_actividad = now() - make_interval(days => ${dias}), estado = ${estado}::estado_publicacion
    WHERE id = ${pub.id}`;
  return pub.id;
}
const estadoDe = async (id: number) =>
  (await prisma.publicacion.findUniqueOrThrow({ where: { id } })).estado;

beforeAll(async () => {
  prisma = clienteTest();
  const bd = prisma as unknown as PrismaService;
  const publicaciones = new PublicacionesService(
    new PublicacionesRepository(bd),
    new AuditoriaService(bd),
  );
  expiracion = new ExpiracionService(bd, publicaciones);
  // Arranque limpio: ninguna publicación de otras pruebas debe quedar vencida.
  await prisma.$executeRaw`UPDATE publicacion SET ultima_actividad = now()`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ExpiracionService.expirarInactivas', () => {
  it('expira solo las ACTIVAS con más de 90 días sin actividad', async () => {
    const d89 = await inactivaHace(89);
    const d91 = await inactivaHace(91);
    const d200 = await inactivaHace(200);
    const enReclamacion = await inactivaHace(120, 'EN_RECLAMACION');

    const res = await expiracion.expirarInactivas();

    expect(res).toEqual({ revisadas: 2, expiradas: 2, omitidas: 0 });
    expect(await estadoDe(d89)).toBe('ACTIVA');
    expect(await estadoDe(d91)).toBe('EXPIRADA');
    expect(await estadoDe(d200)).toBe('EXPIRADA');
    // Una publicación en reclamación no expira aunque esté quieta: hay un proceso en curso.
    expect(await estadoDe(enReclamacion)).toBe('EN_RECLAMACION');
  });

  it('deja rastro: historial con el sistema como autor (id_usuario NULL) y auditoría', async () => {
    const id = await inactivaHace(95);
    await expiracion.expirarInactivas();
    const [h] = await prisma.historial_estado.findMany({ where: { id_publicacion: id } });
    expect(h).toMatchObject({
      estado_nuevo: 'EXPIRADA',
      id_usuario: null,
      motivo: '90 días sin actividad',
    });
    expect(
      await prisma.auditoria.count({ where: { entidad: 'publicacion', id_entidad: id } }),
    ).toBe(1);
  });

  it('correrla dos veces seguidas no hace nada la segunda vez', async () => {
    await inactivaHace(100);
    await expiracion.expirarInactivas();
    await expect(expiracion.expirarInactivas()).resolves.toEqual({
      revisadas: 0,
      expiradas: 0,
      omitidas: 0,
    });
  });
});
