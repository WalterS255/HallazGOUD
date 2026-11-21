import type { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import type { CoincidenciasService } from '../coincidencias/coincidencias.service.js';
import type { DatosCrear, DatosEditar } from './gestion.schemas.js';
import type { GestionRepository } from './gestion.repository.js';
import { GestionService } from './gestion.service.js';
import type { PublicacionesRepository } from './publicaciones.repository.js';
import type { PublicacionesService } from './publicaciones.service.js';

// Pruebas UNITARIAS de crear, editar y retirar (RF-06, RF-07, RF-10) con piezas falsas.
// El CHECK de la BD, el tsvector y las transacciones reales están en test/db/gestion.db-spec.ts.

const HORA = 3_600_000;
type Actual = {
  id_usuario: number;
  tipo: 'PERDIDO' | 'ENCONTRADO';
  estado: string;
  reclamaciones: number;
  fecha_creacion: Date;
};

function armar(
  o: {
    categoria?: { activa: boolean; sensible: boolean } | null;
    lugarExiste?: boolean;
    actual?: Partial<Actual> | null;
    autor?: number | null;
  } = {},
) {
  const llamadas: string[] = [];
  const auditadas: { accion: string; detalle?: unknown }[] = [];
  const guardado: Record<string, unknown> = {};
  const repo = {
    enTransaccion: async <T>(f: (tx: unknown) => Promise<T>) => f('tx'),
    categoria: async () =>
      o.categoria === undefined ? { activa: true, sensible: false } : o.categoria,
    lugarExiste: async () => o.lugarExiste ?? true,
    crear: async (_tx: unknown, d: Record<string, unknown>) => {
      Object.assign(guardado, d);
      llamadas.push('crear');
      return { id: 41 };
    },
    guardarDetalle: async (_tx: unknown, _id: number, texto: string) => {
      llamadas.push(`detalle:${texto}`);
    },
    paraEditar: async () =>
      o.actual === null
        ? null
        : {
            id_usuario: 1,
            tipo: 'ENCONTRADO',
            estado: 'ACTIVA',
            reclamaciones: 0,
            fecha_creacion: new Date(Date.now() - HORA),
            ...o.actual,
          },
    actualizar: async (_tx: unknown, _id: number, cambios: object) => {
      llamadas.push(`actualizar:${Object.keys(cambios).join(',')}`);
    },
    resumen: async () => ({ id: 41, estado: 'ACTIVA' }),
    autorDe: async () => (o.autor === undefined ? 1 : o.autor),
  } as unknown as GestionRepository;
  const repoPublicaciones = {
    agregarHistorial: async (_tx: unknown, h: { estado_nuevo: string }) => {
      llamadas.push(`historial:${h.estado_nuevo}`);
    },
  } as unknown as PublicacionesRepository;
  const publicaciones = {
    cambiarEstado: async (_id: number, hacia: string, m: { motivo: string }) => {
      llamadas.push(`cambiarEstado:${hacia}:${m.motivo}`);
      return { hacia };
    },
  } as unknown as PublicacionesService;
  const auditoria = {
    registrar: async (e: { accion: string; detalle?: unknown }) => {
      auditadas.push(e);
    },
  } as unknown as AuditoriaService;
  const coincidencias = {
    alPublicarEncontrado: async (id: number) => {
      llamadas.push(`coincidencias:${id}`);
    },
  } as unknown as CoincidenciasService;
  const servicio = new GestionService(
    repo,
    repoPublicaciones,
    publicaciones,
    auditoria,
    coincidencias,
  );
  return { servicio, llamadas, auditadas, guardado };
}

const ctx = (rol: 'USUARIO' | 'MODERADOR' | 'ADMIN' = 'USUARIO', id = 1) => ({
  usuario: { id, rol },
  ip: '10.0.0.1',
});
const encontrado = (d: Partial<DatosCrear> = {}): DatosCrear =>
  ({
    tipo: 'ENCONTRADO',
    titulo: 'Calculadora Casio',
    descripcion: 'Gris',
    id_categoria: 2,
    id_lugar: 3,
    fecha_suceso: new Date(Date.now() - HORA),
    detalle_reservado: 'sticker de gato',
    ...d,
  }) as DatosCrear;

describe('GestionService.crear', () => {
  it('ENCONTRADO: guarda, detalle reservado, historial null→ACTIVA, auditoría y DESPUÉS avisa', async () => {
    const { servicio, llamadas, auditadas } = armar();
    const res = await servicio.crear(encontrado(), ctx());
    expect(llamadas).toEqual([
      'crear',
      'detalle:sticker de gato',
      'historial:ACTIVA',
      'coincidencias:41', // fuera de la transacción, al final
    ]);
    expect(auditadas.map((a) => a.accion)).toEqual(['PUBLICACION_CREADA']);
    // La auditoría NUNCA guarda el texto del detalle reservado.
    expect(JSON.stringify(auditadas)).not.toContain('sticker');
    expect(res).toMatchObject({ id: 41, aviso_sensible: false });
  });

  it('PERDIDO: sin detalle reservado y sin aviso de coincidencias', async () => {
    const { servicio, llamadas } = armar();
    await servicio.crear(
      { ...encontrado(), tipo: 'PERDIDO', detalle_reservado: undefined } as unknown as DatosCrear,
      ctx(),
    );
    expect(llamadas).toEqual(['crear', 'historial:ACTIVA']);
  });

  it('categoría sensible → aviso_sensible (regla 6.6)', async () => {
    const { servicio } = armar({ categoria: { activa: true, sensible: true } });
    expect((await servicio.crear(encontrado(), ctx())).aviso_sensible).toBe(true);
  });

  it.each([
    ['inexistente', null],
    ['desactivada', { activa: false, sensible: false }],
  ])('categoría %s → 400 con el campo id_categoria', async (_c, categoria) => {
    const { servicio, llamadas } = armar({ categoria });
    await expect(servicio.crear(encontrado(), ctx())).rejects.toMatchObject({
      codigo: 'SOLICITUD_INVALIDA',
      detalles: [{ campo: 'id_categoria', mensaje: expect.any(String) }],
    });
    expect(llamadas).toEqual([]);
  });

  it('lugar inexistente → 400 con el campo id_lugar', async () => {
    const { servicio } = armar({ lugarExiste: false });
    await expect(servicio.crear(encontrado(), ctx())).rejects.toMatchObject({
      detalles: [{ campo: 'id_lugar', mensaje: expect.any(String) }],
    });
  });

  it('fecha de mañana → 400 en fecha_suceso, sin tocar la BD', async () => {
    const { servicio, llamadas } = armar();
    const manana = new Date(Date.now() + 24 * HORA);
    await expect(servicio.crear(encontrado({ fecha_suceso: manana }), ctx())).rejects.toMatchObject(
      { detalles: [{ campo: 'fecha_suceso', mensaje: 'La fecha no puede estar en el futuro' }] },
    );
    expect(llamadas).toEqual([]);
  });

  it('reloj 3 min adelantado → se guarda con fecha_suceso = ahora (13.7)', async () => {
    const { servicio, guardado } = armar();
    await servicio.crear(encontrado({ fecha_suceso: new Date(Date.now() + 3 * 60_000) }), ctx());
    expect((guardado.fecha_suceso as Date).getTime()).toBe((guardado.ahora as Date).getTime());
  });
});

describe('GestionService.editar (RF-10)', () => {
  const editar = (s: GestionService, d: Partial<DatosEditar>, c = ctx()) =>
    s.editar(41, d as DatosEditar, c);

  it('el autor cambia el título: actualiza y audita solo QUÉ campos cambiaron', async () => {
    const { servicio, llamadas, auditadas } = armar();
    await editar(servicio, { titulo: 'Nuevo título' });
    expect(llamadas).toEqual(['actualizar:titulo']);
    expect(auditadas).toEqual([
      expect.objectContaining({ accion: 'PUBLICACION_EDITADA', detalle: { campos: ['titulo'] } }),
    ]);
  });

  it('no existe → 404', async () => {
    const { servicio } = armar({ actual: null });
    await expect(editar(servicio, { titulo: 'x' })).rejects.toMatchObject({
      codigo: 'PUBLICACION_NO_ENCONTRADA',
    });
  });

  it('otra persona → 403', async () => {
    const { servicio } = armar();
    await expect(editar(servicio, { titulo: 'x' }, ctx('USUARIO', 99))).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
  });

  it.each(['ENTREGADA', 'EXPIRADA', 'RETIRADA'])('estado final %s → 409', async (estado) => {
    const { servicio } = armar({ actual: { estado } });
    await expect(editar(servicio, { titulo: 'x' })).rejects.toMatchObject({
      codigo: 'PUBLICACION_NO_EDITABLE',
    });
  });

  it('cambiar el detalle reservado: se guarda aparte y no sale en la auditoría', async () => {
    const { servicio, llamadas, auditadas } = armar();
    await editar(servicio, { detalle_reservado: 'secreto nuevo' });
    expect(llamadas).toEqual(['actualizar:', 'detalle:secreto nuevo']);
    expect(JSON.stringify(auditadas)).not.toContain('secreto nuevo');
  });

  it('con reclamaciones, el detalle reservado queda bloqueado → 409', async () => {
    const { servicio, llamadas } = armar({ actual: { reclamaciones: 1 } });
    await expect(editar(servicio, { detalle_reservado: 'otro' })).rejects.toMatchObject({
      codigo: 'DETALLE_BLOQUEADO',
    });
    expect(llamadas).toEqual([]);
  });

  it('un PERDIDO no acepta detalle reservado → 400', async () => {
    const { servicio } = armar({ actual: { tipo: 'PERDIDO' } });
    await expect(editar(servicio, { detalle_reservado: 'x' })).rejects.toMatchObject({
      detalles: [{ campo: 'detalle_reservado', mensaje: expect.any(String) }],
    });
  });

  it('fecha posterior a la creación → 400 (CHECK de la BD, adelantado)', async () => {
    const { servicio } = armar();
    await expect(editar(servicio, { fecha_suceso: new Date() })).rejects.toMatchObject({
      detalles: [{ campo: 'fecha_suceso', mensaje: expect.any(String) }],
    });
  });

  it('cambiar a una categoría desactivada → 400; si solo cambia el título no la revisa', async () => {
    const { servicio } = armar({ categoria: { activa: false, sensible: false } });
    await expect(editar(servicio, { id_categoria: 9 })).rejects.toMatchObject({
      detalles: [{ campo: 'id_categoria', mensaje: expect.any(String) }],
    });
    await expect(editar(servicio, { titulo: 'ok' })).resolves.toBeDefined();
  });
});

describe('GestionService.retirar', () => {
  it('el autor la retira con su motivo (pasa por la máquina de estados)', async () => {
    const { servicio, llamadas } = armar();
    expect(await servicio.retirar(41, ctx())).toEqual({ id: 41, estado: 'RETIRADA' });
    expect(llamadas).toEqual(['cambiarEstado:RETIRADA:Retirada por el autor']);
  });

  it.each(['MODERADOR', 'ADMIN'] as const)('un %s la retira "por moderación"', async (rol) => {
    const { servicio, llamadas } = armar();
    await servicio.retirar(41, ctx(rol, 50));
    expect(llamadas).toEqual(['cambiarEstado:RETIRADA:Retirada por moderación']);
  });

  it('otro usuario → 403; inexistente → 404', async () => {
    const { servicio } = armar();
    await expect(servicio.retirar(41, ctx('USUARIO', 99))).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
    const { servicio: s2 } = armar({ autor: null });
    await expect(s2.retirar(41, ctx())).rejects.toMatchObject({
      codigo: 'PUBLICACION_NO_ENCONTRADA',
    });
  });
});
