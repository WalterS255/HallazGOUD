import { ErrorApp } from '../../comun/errores/error-app.js';
import type { CoincidenciasRepository, Publicacion } from './coincidencias.repository.js';
import { CoincidenciasService } from './coincidencias.service.js';

const fecha = new Date('2026-10-01T15:00:00Z');
const pub = (cambios: Partial<Publicacion>): Publicacion => ({
  id: 1,
  tipo: 'PERDIDO',
  id_usuario: 10,
  id_categoria: 5,
  id_sede: 1,
  fecha_suceso: fecha,
  palabras: ['calcul', 'gris'],
  ...cambios,
});

// Repositorio FALSO: el servicio se prueba sin BD (el SQL se prueba en test/db/).
function servicioCon(ref: Publicacion | null, candidatos: Publicacion[]): CoincidenciasService {
  const repo = {
    buscarReferencia: async () => ref,
    buscarCandidatos: async () => candidatos,
  } as unknown as CoincidenciasRepository;
  return new CoincidenciasService(repo);
}

describe('CoincidenciasService.sugerencias', () => {
  it('ordena de mayor a menor y descarta las de 50 o menos', async () => {
    const servicio = servicioCon(pub({}), [
      pub({ id: 2, tipo: 'ENCONTRADO', id_sede: 2 }), // 35 + 0 + 25 + 20 = 80
      pub({ id: 3, tipo: 'ENCONTRADO' }), // 100
      pub({ id: 4, tipo: 'ENCONTRADO', id_categoria: 9, id_sede: 2, palabras: [] }), // 25
    ]);
    const res = await servicio.sugerencias(1);
    expect(res.map((s) => s.id_publicacion)).toEqual([3, 2]);
    expect(res[0].puntaje.total).toBe(100);
  });

  it('sin candidatos devuelve una lista vacía', async () => {
    await expect(servicioCon(pub({}), []).sugerencias(1)).resolves.toEqual([]);
  });

  it('publicación inexistente → 404 PUBLICACION_NO_ENCONTRADA', async () => {
    const error = await servicioCon(null, [])
      .sugerencias(99)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApp);
    expect((error as ErrorApp).codigo).toBe('PUBLICACION_NO_ENCONTRADA');
  });
});
