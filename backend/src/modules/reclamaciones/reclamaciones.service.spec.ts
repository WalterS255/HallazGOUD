import { Prisma } from '../../generated/prisma/client.js';
import type { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import type { PublicacionesService } from '../publicaciones/publicaciones.service.js';
import type { ReclamacionBloqueada, ReclamacionesRepository } from './reclamaciones.repository.js';
import { ReclamacionesService } from './reclamaciones.service.js';

// Falsos mínimos. Las transacciones, los bloqueos y el índice único real están
// en test/db/reclamaciones.db-spec.ts; aquí se prueban las ramas de las reglas.
function armar(o: {
  publicacion?: { tipo: 'PERDIDO' | 'ENCONTRADO'; estado: string; id_usuario: number } | null;
  crear?: () => Promise<{ id: number }>;
  bloqueada?: Partial<ReclamacionBloqueada> | null;
}) {
  const llamadas: string[] = [];
  const repo = {
    publicacion: async () => o.publicacion ?? null,
    crear: o.crear ?? (async () => ({ id: 1 })),
    enTransaccion: async <T>(t: (tx: unknown) => Promise<T>) => t('tx'),
    bloquear: async () =>
      o.bloqueada === null
        ? null
        : {
            id: 5,
            id_publicacion: 9,
            id_reclamante: 2,
            estado: 'PENDIENTE',
            id_autor: 1,
            ...o.bloqueada,
          },
    resolver: async (_tx: unknown, _id: number, e: string) => {
      llamadas.push(`reclamacion:${e}`);
    },
    crearEntregaVacia: async () => {
      llamadas.push('entrega');
    },
  } as unknown as ReclamacionesRepository;
  const publicaciones = {
    cambiarEstadoEn: async (_tx: unknown, _id: number, hacia: string) => {
      llamadas.push(`publicacion:${hacia}`);
    },
  } as unknown as PublicacionesService;
  const auditoria = {
    registrar: async (e: { accion: string }) => {
      llamadas.push(`auditoria:${e.accion}`);
    },
  } as unknown as AuditoriaService;
  return { servicio: new ReclamacionesService(repo, publicaciones, auditoria), llamadas };
}

const datos = { id_publicacion: 9, id_reclamante: 2, respuesta_detalle: 'un sticker' };
const encontradoActiva = { tipo: 'ENCONTRADO' as const, estado: 'ACTIVA', id_usuario: 1 };

describe('ReclamacionesService.crear', () => {
  it.each([
    [null, 'PUBLICACION_NO_ENCONTRADA'],
    [{ ...encontradoActiva, tipo: 'PERDIDO' as const }, 'NO_RECLAMABLE'],
    [{ ...encontradoActiva, estado: 'EN_RECLAMACION' }, 'NO_RECLAMABLE'],
    [{ ...encontradoActiva, id_usuario: 2 }, 'RECLAMACION_PROPIA'],
  ])('publicación %j → %s', async (publicacion, codigo) => {
    await expect(armar({ publicacion }).servicio.crear(datos)).rejects.toMatchObject({ codigo });
  });

  it('traduce el choque con el índice único (P2002) a RECLAMACION_DUPLICADA', async () => {
    const choque = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { servicio } = armar({
      publicacion: encontradoActiva,
      crear: async () => {
        throw choque;
      },
    });
    await expect(servicio.crear(datos)).rejects.toMatchObject({ codigo: 'RECLAMACION_DUPLICADA' });
  });

  it('otros errores de la BD no se disfrazan', async () => {
    const { servicio } = armar({
      publicacion: encontradoActiva,
      crear: async () => {
        throw new Error('conexión perdida');
      },
    });
    await expect(servicio.crear(datos)).rejects.toThrow('conexión perdida');
  });
});

describe('ReclamacionesService.resolver', () => {
  it('ACEPTAR: reclamación, publicación, entrega y auditoría, en ese orden', async () => {
    const { servicio, llamadas } = armar({});
    await servicio.resolver(5, 1, 'ACEPTAR');
    expect(llamadas).toEqual([
      'reclamacion:ACEPTADA',
      'publicacion:EN_RECLAMACION',
      'entrega',
      'auditoria:RECLAMACION_ACEPTADA',
    ]);
  });

  it('RECHAZAR no toca la publicación ni crea entrega', async () => {
    const { servicio, llamadas } = armar({});
    await servicio.resolver(5, 1, 'RECHAZAR');
    expect(llamadas).toEqual(['reclamacion:RECHAZADA', 'auditoria:RECLAMACION_RECHAZADA']);
  });

  it('quien no es el autor recibe PROHIBIDO; una ya resuelta, RECLAMACION_RESUELTA', async () => {
    await expect(armar({}).servicio.resolver(5, 99, 'ACEPTAR')).rejects.toMatchObject({
      codigo: 'PROHIBIDO',
    });
    await expect(
      armar({ bloqueada: { estado: 'RECHAZADA' } }).servicio.resolver(5, 1, 'ACEPTAR'),
    ).rejects.toMatchObject({ codigo: 'RECLAMACION_RESUELTA' });
  });
});
