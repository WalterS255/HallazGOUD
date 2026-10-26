import type { AuditoriaService } from '../../lib/auditoria/auditoria.service.js';
import type { EstadoPublicacion } from './estados.js';
import type { PublicacionesRepository } from './publicaciones.repository.js';
import { PublicacionesService } from './publicaciones.service.js';

// Repositorio y auditoría FALSOS que anotan lo que se les pide, en orden.
// La transacción real y el bloqueo se prueban en test/db/estados.db-spec.ts.
function armar(estadoActual: EstadoPublicacion | null) {
  const llamadas: string[] = [];
  const repo = {
    enTransaccion: async <T>(trabajo: (tx: unknown) => Promise<T>) => trabajo('tx'),
    bloquearParaCambio: async () => (estadoActual ? { estado: estadoActual, id_usuario: 7 } : null),
    guardarEstado: async (_tx: unknown, _id: number, e: EstadoPublicacion) => {
      llamadas.push(`estado:${e}`);
    },
    agregarHistorial: async (_tx: unknown, d: { motivo: string }) => {
      llamadas.push(`historial:${d.motivo}`);
    },
  } as unknown as PublicacionesRepository;
  const auditoria = {
    registrar: async (_e: unknown, tx: unknown) => {
      llamadas.push(`auditoria:${String(tx)}`);
    },
  } as unknown as AuditoriaService;
  return { servicio: new PublicacionesService(repo, auditoria), llamadas };
}

describe('PublicacionesService.cambiarEstado', () => {
  it('transición válida: estado, historial y auditoría, en ese orden y en la misma tx', async () => {
    const { servicio, llamadas } = armar('ACTIVA');
    await expect(servicio.cambiarEstado(1, 'RETIRADA', { id_usuario: 7 })).resolves.toEqual({
      desde: 'ACTIVA',
      hacia: 'RETIRADA',
    });
    expect(llamadas).toEqual([
      'estado:RETIRADA',
      'historial:Retirada por el autor o un moderador',
      'auditoria:tx',
    ]);
  });

  it('usa el motivo que le dan en lugar de la causa por defecto', async () => {
    const { servicio, llamadas } = armar('ACTIVA');
    await servicio.cambiarEstado(1, 'RETIRADA', { id_usuario: 3, motivo: 'Contenido ofensivo' });
    expect(llamadas[1]).toBe('historial:Contenido ofensivo');
  });

  it('transición inválida → 409 TRANSICION_INVALIDA y no escribe nada', async () => {
    const { servicio, llamadas } = armar('ENTREGADA');
    await expect(servicio.cambiarEstado(1, 'ACTIVA', { id_usuario: 7 })).rejects.toMatchObject({
      codigo: 'TRANSICION_INVALIDA',
    });
    expect(llamadas).toEqual([]);
  });

  it('publicación inexistente → 404 PUBLICACION_NO_ENCONTRADA', async () => {
    const { servicio } = armar(null);
    await expect(servicio.cambiarEstado(99, 'RETIRADA', { id_usuario: 7 })).rejects.toMatchObject({
      codigo: 'PUBLICACION_NO_ENCONTRADA',
    });
  });
});
