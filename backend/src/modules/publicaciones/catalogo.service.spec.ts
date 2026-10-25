import type { CatalogoRepository, FiltrosCatalogo } from './catalogo.repository.js';
import { CatalogoService } from './catalogo.service.js';

// Repositorio FALSO que anota con qué filtros lo llamaron. El SQL real: test/db/catalogo.
function armar() {
  const recibidos: FiltrosCatalogo[] = [];
  const repo = {
    buscar: async (f: FiltrosCatalogo) => {
      recibidos.push(f);
      return { items: [], total: 0 };
    },
  } as unknown as CatalogoRepository;
  return { servicio: new CatalogoService(repo), recibidos };
}

describe('CatalogoService.listar', () => {
  it('por defecto: página 1, 20 por página, más recientes primero', async () => {
    const { servicio, recibidos } = armar();
    await expect(servicio.listar({})).resolves.toEqual({
      datos: [],
      total: 0,
      pagina: 1,
      limite: 20,
    });
    expect(recibidos[0]).toMatchObject({ orden: 'recientes', limite: 20, desplazamiento: 0 });
  });

  it('calcula el desplazamiento de la página: página 3 de 10 → salta 20', async () => {
    const { servicio, recibidos } = armar();
    await servicio.listar({ pagina: 3, limite: 10 });
    expect(recibidos[0]).toMatchObject({ limite: 10, desplazamiento: 20 });
  });

  it('acota límite (1..50) y página (≥ 1), y descarta decimales', async () => {
    const { servicio, recibidos } = armar();
    await servicio.listar({ limite: 999, pagina: 0 });
    await servicio.listar({ limite: 0.5, pagina: 2.9 });
    expect(recibidos.map((r) => [r.limite, r.desplazamiento])).toEqual([
      [50, 0],
      [1, 1],
    ]);
  });

  it('con palabras clave ordena por relevancia; una búsqueda de puros espacios no cuenta', async () => {
    const { servicio, recibidos } = armar();
    await servicio.listar({ q: '  calculadora ' });
    await servicio.listar({ q: '   ' });
    expect(recibidos[0]).toMatchObject({ q: 'calculadora', orden: 'relevancia' });
    expect(recibidos[1]).toMatchObject({ q: undefined, orden: 'recientes' });
  });

  it('respeta el orden que se pide explícitamente', async () => {
    const { servicio, recibidos } = armar();
    await servicio.listar({ q: 'llaves', orden: 'antiguos' });
    expect(recibidos[0].orden).toBe('antiguos');
  });
});
