import { Prisma } from '../../generated/prisma/client.js';
import type { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import type { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { ModeracionRepository, ReporteBloqueado } from './moderacion.repository.js';
import { ModeracionService } from './moderacion.service.js';

// Falsos que anotan lo que se pide, en orden. Transacción, bloqueo e índice reales:
// test/db/moderacion.db-spec.ts.
function armar(o: {
  publicacion?: { id_usuario: number; oculta: boolean } | null;
  crear?: () => Promise<{ id: number }>;
  bloqueado?: Partial<ReporteBloqueado> | null;
  reportes?: { fecha: Date }[];
}) {
  const llamadas: string[] = [];
  const repo = {
    publicacion: async () =>
      o.publicacion === undefined ? { id_usuario: 1, oculta: false } : o.publicacion,
    crearReporte: o.crear ?? (async () => ({ id: 7 })),
    listar: async () => o.reportes ?? [],
    enTransaccion: async <T>(t: (tx: unknown) => Promise<T>) => t('tx'),
    bloquear: async () =>
      o.bloqueado === null
        ? null
        : {
            id: 7,
            estado: 'PENDIENTE',
            id_publicacion: 3,
            id_autor: 1,
            titulo: 'Termo',
            ...o.bloqueado,
          },
    ocultar: async () => {
      llamadas.push('ocultar');
    },
    resolverPendientesDe: async () => {
      llamadas.push('resolver-todos');
    },
    resolver: async (_tx: unknown, _id: number, e: string) => {
      llamadas.push(`reporte:${e}`);
    },
  } as unknown as ModeracionRepository;
  const auditoria = {
    registrar: async (e: { accion: string }) => {
      llamadas.push(`auditoria:${e.accion}`);
    },
  } as unknown as AuditoriaService;
  const notificaciones = {
    avisar: async (a: { id_usuario: number; tipo: string }) => {
      llamadas.push(`aviso:${a.tipo}->${a.id_usuario}`);
    },
  } as unknown as NotificacionesService;
  return { servicio: new ModeracionService(repo, auditoria, notificaciones), llamadas };
}

const datos = { id_publicacion: 3, id_reportante: 2, motivo: 'datos personales' };

describe('ModeracionService.reportar', () => {
  it.each([
    [null, 'PUBLICACION_NO_ENCONTRADA'],
    [{ id_usuario: 1, oculta: true }, 'PUBLICACION_NO_ENCONTRADA'], // oculta = no existe
    [{ id_usuario: 2, oculta: false }, 'REPORTE_PROPIO'],
  ])('publicación %j → %s', async (publicacion, codigo) => {
    await expect(armar({ publicacion }).servicio.reportar(datos)).rejects.toMatchObject({ codigo });
  });

  it('el choque con el índice único parcial (P2002) es REPORTE_DUPLICADO', async () => {
    const choque = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 't',
    });
    const { servicio } = armar({
      crear: async () => {
        throw choque;
      },
    });
    await expect(servicio.reportar(datos)).rejects.toMatchObject({ codigo: 'REPORTE_DUPLICADO' });
  });
});

describe('ModeracionService.bandeja', () => {
  it('marca como vencidos los pendientes de 48 h o más', async () => {
    const ahora = new Date('2026-10-25T12:00:00Z');
    const hace = (h: number) => ({ fecha: new Date(ahora.getTime() - h * 3_600_000) });
    const { servicio } = armar({ reportes: [hace(50), hace(48), hace(47)] });
    const r = await servicio.bandeja('PENDIENTE', ahora);
    expect(r.map((x) => [x.horas_pendiente, x.vencido])).toEqual([
      [50, true],
      [48, true],
      [47, false],
    ]);
  });
});

describe('ModeracionService.resolver', () => {
  it('OCULTAR: oculta, cierra todos los pendientes, audita y DESPUÉS avisa a la autora', async () => {
    const { servicio, llamadas } = armar({});
    await servicio.resolver(7, 5, 'OCULTAR', 'datos personales');
    expect(llamadas).toEqual([
      'ocultar',
      'resolver-todos',
      'auditoria:MODERACION_OCULTAR',
      'aviso:MODERACION->1',
    ]);
  });

  it('DESCARTAR: no oculta ni avisa', async () => {
    const { servicio, llamadas } = armar({});
    await servicio.resolver(7, 5, 'DESCARTAR', undefined);
    expect(llamadas).toEqual(['reporte:DESCARTADO', 'auditoria:MODERACION_RESOLVER']);
  });

  it('inexistente → 404; ya resuelto → 409', async () => {
    await expect(
      armar({ bloqueado: null }).servicio.resolver(9, 5, 'OCULTAR', undefined),
    ).rejects.toMatchObject({
      codigo: 'REPORTE_NO_ENCONTRADO',
    });
    await expect(
      armar({ bloqueado: { estado: 'RESUELTO' } }).servicio.resolver(7, 5, 'OCULTAR', undefined),
    ).rejects.toMatchObject({ codigo: 'REPORTE_RESUELTO' });
  });
});
