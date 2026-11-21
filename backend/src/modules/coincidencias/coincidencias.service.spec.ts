import { ErrorApp } from '../../comun/errores/error-app.js';
import type { CoincidenciasRepository, Publicacion } from './coincidencias.repository.js';
import type { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { CoincidenciasService } from './coincidencias.service.js';

const fecha = new Date('2026-10-01T15:00:00Z');
const pub = (cambios: Partial<Publicacion>): Publicacion => ({
  id: 1,
  tipo: 'PERDIDO',
  id_usuario: 10,
  id_categoria: 5,
  id_sede: 1,
  tipo_lugar: null,
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
  return new CoincidenciasService(repo, avisosFalsos as unknown as NotificacionesService);
}

const avisados: { id_usuario: number; tipo: string }[] = [];
const avisosFalsos = {
  avisarATodos: async (lista: { id_usuario: number; tipo: string }[]) => {
    avisados.push(...lista);
  },
};

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

describe('CoincidenciasService.sugerenciasParaAutor', () => {
  it('el autor las ve', async () => {
    const servicio = servicioCon(pub({ id_usuario: 10 }), [pub({ id: 3, tipo: 'ENCONTRADO' })]);
    await expect(servicio.sugerenciasParaAutor(1, 10)).resolves.toHaveLength(1);
  });

  it('otro usuario recibe PROHIBIDO (no se filtra qué objetos coinciden)', async () => {
    const servicio = servicioCon(pub({ id_usuario: 10 }), [pub({ id: 3, tipo: 'ENCONTRADO' })]);
    await expect(servicio.sugerenciasParaAutor(1, 99)).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
  });
});

describe('CoincidenciasService.avisarCompatibles (RF-24)', () => {
  beforeEach(() => {
    avisados.length = 0;
  });

  it('avisa UNA vez a cada autor de PERDIDOS compatibles (> 50)', async () => {
    const encontrado = pub({ id: 1, tipo: 'ENCONTRADO', id_usuario: 10 });
    const servicio = servicioCon(encontrado, [
      pub({ id: 2, id_usuario: 20 }), // 100 puntos
      pub({ id: 3, id_usuario: 20 }), // el mismo autor otra vez
      pub({ id: 4, id_usuario: 30, id_categoria: 9, id_sede: 2, palabras: [] }), // 25: no
    ]);
    await expect(servicio.avisarCompatibles(1)).resolves.toBe(1);
    expect(avisados).toEqual([expect.objectContaining({ id_usuario: 20, tipo: 'COINCIDENCIA' })]);
  });

  it('con un PERDIDO (o una publicación que no existe) no avisa a nadie', async () => {
    await expect(
      servicioCon(pub({ tipo: 'PERDIDO' }), [pub({})]).avisarCompatibles(1),
    ).resolves.toBe(0);
    await expect(servicioCon(null, []).avisarCompatibles(99)).resolves.toBe(0);
    expect(avisados).toEqual([]);
  });
});

describe('CoincidenciasService.alPublicarEncontrado', () => {
  it('NUNCA lanza: si buscar compatibles falla, la publicación creada no se ve afectada', async () => {
    const repo = {
      buscarReferencia: async () => {
        throw new Error('la BD se cayó');
      },
    } as unknown as CoincidenciasRepository;
    const servicio = new CoincidenciasService(
      repo,
      avisosFalsos as unknown as NotificacionesService,
    );
    await expect(servicio.alPublicarEncontrado(1)).resolves.toBeUndefined();
  });
});
