// El prefiltro SQL del motor de coincidencias contra PostgreSQL real, con el mismo
// escenario que docs/sql/04_coincidencias.sql: casos de 0, 7 y 8 días, entregada,
// oculta, mismo autor y mismo tipo.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { CoincidenciasRepository } from '../../src/modules/coincidencias/coincidencias.repository.js';
import { CoincidenciasService } from '../../src/modules/coincidencias/coincidencias.service.js';
import { clienteTest, crearUsuario, unico } from './ayudas.js';

const DIA = 86_400_000;
let prisma: PrismaClient;
let servicio: CoincidenciasService;
const ids: Record<string, number> = {};

beforeAll(async () => {
  prisma = clienteTest();
  servicio = new CoincidenciasService(
    new CoincidenciasRepository(prisma as unknown as PrismaService),
  );

  const [perdedor, otro] = [await crearUsuario(prisma), await crearUsuario(prisma)];
  const sede = await prisma.sede.create({ data: { nombre: unico('Sede ') } });
  const otraSede = await prisma.sede.create({ data: { nombre: unico('Sede ') } });
  const lugar = await prisma.lugar.create({ data: { id_sede: sede.id, edificio: 'Biblioteca' } });
  const lugarOtraSede = await prisma.lugar.create({
    data: { id_sede: otraSede.id, edificio: 'Cafetería' },
  });
  const utiles = await prisma.categoria.create({ data: { nombre: unico('Útiles ') } });
  const base = Date.now() - 10 * DIA; // hace 10 días: así +8 días sigue en el pasado

  const crear = async (
    clave: string,
    datos: Partial<{
      tipo: 'PERDIDO' | 'ENCONTRADO';
      dias: number;
      autor: number;
      lugar: number;
      estado: 'ACTIVA' | 'ENTREGADA';
      oculta: boolean;
      titulo: string;
    }>,
  ) => {
    const p = await prisma.publicacion.create({
      data: {
        id_usuario: datos.autor ?? otro.id,
        id_categoria: utiles.id,
        id_lugar: datos.lugar ?? lugar.id,
        tipo: datos.tipo ?? 'ENCONTRADO',
        titulo: datos.titulo ?? 'Calculadora científica gris',
        descripcion: 'Calculadora Casio en la biblioteca',
        fecha_suceso: new Date(base + (datos.dias ?? 0) * DIA),
        estado: datos.estado ?? 'ACTIVA',
        oculta: datos.oculta ?? false,
      },
    });
    ids[clave] = p.id;
  };

  await crear('ref', {
    tipo: 'PERDIDO',
    autor: perdedor.id,
    titulo: 'Calculadora Casio perdida',
  });
  await crear('mismoDia', {});
  await crear('dia7', { dias: 7 });
  await crear('dia8', { dias: 8 });
  await crear('otraSede3DiasAntes', { dias: -3, lugar: lugarOtraSede.id });
  await crear('entregada', { estado: 'ENTREGADA' });
  await crear('oculta', { oculta: true });
  await crear('mismoAutor', { autor: perdedor.id });
  await crear('mismoTipo', { tipo: 'PERDIDO' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('CoincidenciasService con el prefiltro SQL real', () => {
  it('devuelve solo los candidatos válidos, ordenados por puntaje', async () => {
    const res = await servicio.sugerencias(ids.ref);
    expect(res.map((s) => s.id_publicacion)).toEqual([
      ids.mismoDia,
      ids.dia7,
      ids.otraSede3DiasAntes,
    ]);
  });

  it('el día 7 entra a la ventana con tiempo 0 y el día 8 queda fuera', async () => {
    const res = await servicio.sugerencias(ids.ref);
    expect(res.find((s) => s.id_publicacion === ids.dia7)?.puntaje.tiempo).toBe(0);
    expect(res.some((s) => s.id_publicacion === ids.dia8)).toBe(false);
  });

  it('descarta entregadas, ocultas, del mismo autor y del mismo tipo', async () => {
    const devueltos = new Set((await servicio.sugerencias(ids.ref)).map((s) => s.id_publicacion));
    for (const clave of ['entregada', 'oculta', 'mismoAutor', 'mismoTipo']) {
      expect(devueltos.has(ids[clave]), clave).toBe(false);
    }
  });

  it('funciona al revés: un ENCONTRADO encuentra al PERDIDO (a quién notificar)', async () => {
    const res = await servicio.sugerencias(ids.mismoDia);
    expect(res.map((s) => s.id_publicacion)).toContain(ids.ref);
  });
});
