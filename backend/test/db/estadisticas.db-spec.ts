// Estadísticas (RF-30) contra PostgreSQL real. Los datos son de 2020 para no
// mezclarse con los de las demás pruebas (que se crean con la fecha de hoy).
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { EstadisticasRepository } from '../../src/modules/admin/estadisticas.repository.js';
import { EstadisticasService } from '../../src/modules/admin/estadisticas.service.js';
import { clienteTest, crearUsuario, unico } from './ayudas.js';

let prisma: PrismaClient;
let servicio: EstadisticasService;
let catA: number, catB: number, biblioteca: number;

// Medianoche en Bogotá = 05:00 UTC.
const periodo = {
  desde: new Date('2020-01-01T05:00:00Z'),
  hasta: new Date('2020-03-01T05:00:00Z'),
};

beforeAll(async () => {
  prisma = clienteTest();
  servicio = new EstadisticasService(
    new EstadisticasRepository(prisma as unknown as PrismaService),
  );

  const autor = await crearUsuario(prisma);
  const sede = await prisma.sede.create({ data: { nombre: unico('Sede est ') } });
  const [lb, lc] = [
    await prisma.lugar.create({ data: { id_sede: sede.id, edificio: 'Biblioteca' } }),
    await prisma.lugar.create({ data: { id_sede: sede.id, edificio: 'Cafetería' } }),
  ];
  biblioteca = lb.id;
  catA = (await prisma.categoria.create({ data: { nombre: unico('A ') } })).id;
  catB = (await prisma.categoria.create({ data: { nombre: unico('B ') } })).id;

  const crear = (
    creada: string,
    tipo: 'PERDIDO' | 'ENCONTRADO',
    id_categoria: number,
    id_lugar: number,
    estado: 'ACTIVA' | 'ENTREGADA' = 'ACTIVA',
  ) => {
    const fecha_creacion = new Date(creada);
    return prisma.publicacion.create({
      data: {
        id_usuario: autor.id,
        id_categoria,
        id_lugar,
        tipo,
        estado,
        titulo: 'Objeto de 2020',
        descripcion: 'Para estadísticas',
        fecha_creacion,
        fecha_suceso: new Date(fecha_creacion.getTime() - 3_600_000),
      },
    });
  };

  await crear('2020-01-10T15:00:00Z', 'PERDIDO', catA, lb.id);
  // BORDE: 1 de febrero 03:00 UTC = 31 de enero 22:00 en Bogotá → cuenta en ENERO.
  await crear('2020-02-01T03:00:00Z', 'PERDIDO', catA, lb.id);
  await crear('2020-01-20T15:00:00Z', 'ENCONTRADO', catA, lc.id);
  await crear('2020-02-15T15:00:00Z', 'ENCONTRADO', catB, lc.id, 'ENTREGADA');
  await crear('2020-02-20T15:00:00Z', 'ENCONTRADO', catB, lc.id);
  // Fuera del periodo: no debe contar.
  await crear('2020-03-05T15:00:00Z', 'PERDIDO', catB, lc.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('EstadisticasService.obtener (BD real)', () => {
  it('publicaciones por mes en HORA DE COLOMBIA (el 31 de enero a las 22:00 cuenta en enero)', async () => {
    const e = await servicio.obtener(periodo);
    expect(e.por_mes).toEqual([
      { mes: '2020-01', perdidos: 2, encontrados: 1 },
      { mes: '2020-02', perdidos: 0, encontrados: 2 },
    ]);
  });

  it('tasa de recuperación = encontrados entregados / encontrados', async () => {
    const { recuperacion } = await servicio.obtener(periodo);
    expect(recuperacion.encontrados).toBe(3);
    expect(recuperacion.entregados).toBe(1);
    expect(recuperacion.tasa).toBeCloseTo(1 / 3, 5);
  });

  it('categorías más frecuentes y lugares críticos (solo PERDIDOS), de mayor a menor', async () => {
    const e = await servicio.obtener(periodo);
    expect(e.categorias_frecuentes.map((c) => [c.id, c.total])).toEqual([
      [catA, 3],
      [catB, 2],
    ]);
    expect(e.lugares_criticos).toHaveLength(1);
    expect(e.lugares_criticos[0]).toMatchObject({ id: biblioteca, total: 2 });
    expect(e.lugares_criticos[0].nombre).toMatch(/· Biblioteca$/);
  });

  it('un periodo sin datos devuelve listas vacías y tasa null (no divide por cero)', async () => {
    const e = await servicio.obtener({
      desde: new Date('2019-01-01T05:00:00Z'),
      hasta: new Date('2019-02-01T05:00:00Z'),
    });
    expect(e).toMatchObject({
      por_mes: [],
      categorias_frecuentes: [],
      lugares_criticos: [],
      recuperacion: { encontrados: 0, entregados: 0, tasa: null },
    });
  });
});
