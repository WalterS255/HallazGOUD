// Catálogo público (RF-13 a RF-16) contra PostgreSQL real.
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/lib/prisma/prisma.service.js';
import { CatalogoRepository } from '../../src/modules/publicaciones/catalogo.repository.js';
import {
  CatalogoService,
  type ParametrosCatalogo,
} from '../../src/modules/publicaciones/catalogo.service.js';
import { clienteTest, crearUsuario, unico } from './ayudas.js';

const DIA = 86_400_000;
let prisma: PrismaClient;
let catalogo: CatalogoService;
let base: { id_categoria: number; id_sede: number }; // aísla estas pruebas de las demás
const ids: Record<string, number> = {};

const listar = (p: Partial<ParametrosCatalogo> = {}) => catalogo.listar({ ...base, ...p });

beforeAll(async () => {
  prisma = clienteTest();
  catalogo = new CatalogoService(new CatalogoRepository(prisma as unknown as PrismaService));

  const autor = await crearUsuario(prisma);
  const sede = await prisma.sede.create({ data: { nombre: unico('Sede catálogo ') } });
  const lugar = await prisma.lugar.create({ data: { id_sede: sede.id, edificio: 'Biblioteca' } });
  const categoria = await prisma.categoria.create({ data: { nombre: unico('Cat catálogo ') } });
  base = { id_categoria: categoria.id, id_sede: sede.id };

  // Se crean en orden: cada una 1 minuto "más reciente" que la anterior.
  const t0 = Date.now() - 60 * 60_000;
  const filas = [
    ['titulo', 'Calculadora Casio', 'Encontrada en la mesa 4', 'ENCONTRADO', 'ACTIVA', false],
    ['desc', 'Objeto gris', 'Parece una calculadora científica', 'ENCONTRADO', 'ACTIVA', false],
    ['perdido', 'Perdí mis llaves', 'Llavero azul', 'PERDIDO', 'ACTIVA', false],
    ['viejo', 'Sombrilla negra', 'Olvidada hace un mes', 'ENCONTRADO', 'ACTIVA', false],
    ['termo', 'Termo metálico', 'Con stickers', 'ENCONTRADO', 'ACTIVA', false],
    ['entregada', 'Calculadora entregada', 'Ya se devolvió', 'ENCONTRADO', 'ENTREGADA', false],
    ['oculta', 'Calculadora oculta', 'Ocultada por moderación', 'ENCONTRADO', 'ACTIVA', true],
  ] as const;
  for (const [i, [clave, titulo, descripcion, tipo, estado, oculta]] of filas.entries()) {
    const creada = new Date(t0 + i * 60_000);
    const p = await prisma.publicacion.create({
      data: {
        id_usuario: autor.id,
        id_categoria: categoria.id,
        id_lugar: lugar.id,
        tipo,
        titulo,
        descripcion,
        estado,
        oculta,
        fecha_creacion: creada,
        // mismo reloj que fecha_creacion (regla de fechas); la "vieja" pasó hace 30 días
        fecha_suceso: new Date(creada.getTime() - (clave === 'viejo' ? 30 * DIA : 60_000)),
      },
    });
    ids[clave] = p.id;
  }
  await prisma.imagen.createMany({
    data: [
      { id_publicacion: ids.titulo, url: 'b.webp', url_miniatura: 'b_min.webp', orden: 2 },
      { id_publicacion: ids.titulo, url: 'a.webp', url_miniatura: 'a_min.webp', orden: 1 },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const idsDe = (r: { datos: { id: number }[] }) => r.datos.map((d) => d.id);

describe('CatalogoService.listar (BD real)', () => {
  it('por defecto: solo ACTIVAS y no ocultas, las más recientes primero', async () => {
    const r = await listar();
    expect(idsDe(r)).toEqual([ids.termo, ids.viejo, ids.perdido, ids.desc, ids.titulo]);
    expect(r.total).toBe(5);
  });

  it('filtra por tipo y por estado', async () => {
    expect(idsDe(await listar({ tipo: 'PERDIDO' }))).toEqual([ids.perdido]);
    expect(idsDe(await listar({ estado: 'ENTREGADA' }))).toEqual([ids.entregada]);
  });

  it('filtra por rango de fechas del suceso', async () => {
    const r = await listar({ hasta: new Date(Date.now() - 10 * DIA) });
    expect(idsDe(r)).toEqual([ids.viejo]);
  });

  it('busca en español (plural, sin tilde) y ordena por relevancia: título antes que descripción', async () => {
    const r = await listar({ q: 'calculadoras' });
    // la del TÍTULO (peso A) gana a la de la DESCRIPCIÓN (peso B); entregada y oculta no salen
    expect(idsDe(r)).toEqual([ids.titulo, ids.desc]);
  });

  it('pagina sin repetir ni saltarse filas', async () => {
    const paginas = await Promise.all([1, 2, 3].map((pagina) => listar({ pagina, limite: 2 })));
    expect(paginas.map((p) => p.datos.length)).toEqual([2, 2, 1]);
    expect(new Set(paginas.flatMap(idsDe)).size).toBe(5);
    expect(paginas[0]).toMatchObject({ total: 5, pagina: 1, limite: 2 });
  });

  it('nunca devuelve más de 50 por página ni páginas menores que 1', async () => {
    const r = await listar({ limite: 5000, pagina: -3 });
    expect(r).toMatchObject({ limite: 50, pagina: 1 });
  });

  it('orden "antiguos" invierte el orden', async () => {
    expect(idsDe(await listar({ orden: 'antiguos' }))[0]).toBe(ids.titulo);
  });

  it('la miniatura es la de la imagen con orden 1', async () => {
    const r = await listar({ q: 'casio' });
    expect(r.datos[0].miniatura).toBe('a_min.webp');
  });

  it('una búsqueda con SQL malicioso es solo una búsqueda sin resultados', async () => {
    const r = await listar({ q: "'; DROP TABLE usuario; --" });
    expect(r.total).toBe(0);
    expect(await prisma.usuario.count()).toBeGreaterThan(0); // la tabla sigue ahí
  });

  it('ANTI-FUGA (§6.3): cada fila trae exactamente los campos públicos', async () => {
    const r = await listar();
    const permitidos = [
      'categoria',
      'edificio',
      'estado',
      'fecha_creacion',
      'fecha_suceso',
      'id',
      'miniatura',
      'sede',
      'tipo',
      'titulo',
    ];
    for (const fila of r.datos) expect(Object.keys(fila).sort()).toEqual(permitidos);
    const texto = JSON.stringify(r);
    for (const prohibido of ['correo', 'hash_contrasena', 'detalle_reservado', 'id_usuario']) {
      expect(texto).not.toContain(prohibido);
    }
  });
});
