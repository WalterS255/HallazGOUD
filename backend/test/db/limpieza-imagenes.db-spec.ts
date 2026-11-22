// §6.5: las fotos de una publicación entregada se borran 90 días después de la entrega.
// La consulta cruza publicación → reclamación ACEPTADA → entrega → imagen: se prueba
// contra PostgreSQL real. El bucket es falso y anota qué claves se borraron.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { LimpiezaImagenesService } from '../../src/jobs/limpieza-imagenes.service.js';
import type { AlmacenamientoService } from '../../src/lib/almacenamiento/almacenamiento.service.js';
import { AuditoriaService } from '../../src/lib/auditoria/auditoria.service.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { clienteTest, crearPublicacion, crearUsuario, resueltaAhora } from './ayudas.js';

let prisma: PrismaClient;
let limpieza: LimpiezaImagenesService;
const borradasS3: string[] = [];
const DIA = 86_400_000;

beforeAll(async () => {
  prisma = clienteTest();
  const bd = prisma as unknown as PrismaService;
  const almacenamiento = {
    borrarSinRomper: async (clave: string) => {
      borradasS3.push(clave);
    },
  } as unknown as AlmacenamientoService;
  limpieza = new LimpiezaImagenesService(bd, almacenamiento, new AuditoriaService(bd));
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Publicación con 2 fotos. Si se indica, entregada hace `diasEntrega` días.
async function publicacionConFotos(o: { diasEntrega?: number } = {}) {
  const p = await crearPublicacion(prisma, { tipo: 'ENCONTRADO' });
  for (const orden of [1, 2]) {
    await prisma.imagen.create({
      data: {
        id_publicacion: p.id,
        orden,
        url: `/api/imagenes/publicaciones/${p.id}/foto${orden}.webp`,
        url_miniatura: `/api/imagenes/publicaciones/${p.id}/foto${orden}_min.webp`,
      },
    });
  }
  if (o.diasEntrega !== undefined) {
    const reclamante = await crearUsuario(prisma);
    const r = await prisma.reclamacion.create({
      data: {
        id_publicacion: p.id,
        id_reclamante: reclamante.id,
        respuesta_detalle: 'es mío',
        estado: 'ACEPTADA',
        ...resueltaAhora(),
      },
    });
    // CHECK: fecha_entrega solo si las dos partes confirmaron.
    await prisma.entrega.create({
      data: {
        id_reclamacion: r.id,
        confirmo_autor: true,
        confirmo_reclamante: true,
        fecha_entrega: new Date(Date.now() - o.diasEntrega * DIA),
      },
    });
    await prisma.publicacion.update({ where: { id: p.id }, data: { estado: 'ENTREGADA' } });
  }
  return p.id;
}

const fotosDe = (id: number) => prisma.imagen.count({ where: { id_publicacion: id } });

describe('limpieza de fotos 90 días después de la entrega (§6.5)', () => {
  it('borra solo las de entregas de hace más de 90 días, en la BD y en S3, y lo audita', async () => {
    const vieja = await publicacionConFotos({ diasEntrega: 91 });
    const reciente = await publicacionConFotos({ diasEntrega: 89 });
    const activa = await publicacionConFotos(); // sin entrega: no se toca

    const r = await limpieza.limpiarEntregadas();

    expect(await fotosDe(vieja)).toBe(0);
    expect(await fotosDe(reciente)).toBe(2);
    expect(await fotosDe(activa)).toBe(2);
    expect(r.publicaciones).toBeGreaterThanOrEqual(1);
    // Grande y miniatura de cada foto, sin el prefijo /api/imagenes/.
    expect(borradasS3).toEqual(
      expect.arrayContaining([
        `publicaciones/${vieja}/foto1.webp`,
        `publicaciones/${vieja}/foto1_min.webp`,
        `publicaciones/${vieja}/foto2.webp`,
        `publicaciones/${vieja}/foto2_min.webp`,
      ]),
    );
    expect(borradasS3.some((c) => c.includes(`/${reciente}/`))).toBe(false);

    const auditoria = await prisma.auditoria.findFirst({
      where: { accion: 'IMAGENES_RETENCION', id_entidad: vieja },
      select: { id_usuario: true, detalle: true },
    });
    expect(auditoria).toEqual({ id_usuario: null, detalle: { imagenes: 2, dias: 90 } });
  });

  it('repetirla no hace nada nuevo (ya no quedan fotos que borrar)', async () => {
    const vieja = await publicacionConFotos({ diasEntrega: 120 });
    await limpieza.limpiarEntregadas();
    const antes = borradasS3.length;
    const segunda = await limpieza.limpiarEntregadas();
    expect(segunda).toEqual({ publicaciones: 0, imagenes: 0 });
    expect(borradasS3.length).toBe(antes);
    expect(await fotosDe(vieja)).toBe(0);
    // La publicación sigue existiendo (solo se fueron las fotos).
    expect(await prisma.publicacion.count({ where: { id: vieja, estado: 'ENTREGADA' } })).toBe(1);
  });
});
