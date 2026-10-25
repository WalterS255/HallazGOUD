import { HttpStatus } from '@nestjs/common';
import { ErrorApp } from '../comun/errores/error-app.js';
import type { PrismaService } from '../lib/prisma/prisma.service.js';
import type { PublicacionesService } from '../modules/publicaciones/publicaciones.service.js';
import { ExpiracionService } from './expiracion.service.js';

// Falsos: la BD "encuentra" las publicaciones 1, 2 y 3, y cambiarEstado se
// comporta distinto con cada una. Los casos de 89/90/91 días están en test/db/.
function armar(comportamiento: Record<number, 'ok' | 'carrera' | 'roto'>) {
  const prisma = {
    $queryRaw: async () => Object.keys(comportamiento).map((id) => ({ id: Number(id) })),
  } as unknown as PrismaService;
  const publicaciones = {
    cambiarEstado: async (id: number) => {
      if (comportamiento[id] === 'carrera') {
        throw new ErrorApp(HttpStatus.CONFLICT, 'TRANSICION_INVALIDA', 'ya cambió');
      }
      if (comportamiento[id] === 'roto') throw new Error('la BD se cayó');
      return { desde: 'ACTIVA', hacia: 'EXPIRADA' };
    },
  } as unknown as PublicacionesService;
  return new ExpiracionService(prisma, publicaciones);
}

describe('ExpiracionService.expirarInactivas', () => {
  it('cuenta como omitida la que otra petición cambió antes (no es un error)', async () => {
    await expect(armar({ 1: 'ok', 2: 'carrera', 3: 'ok' }).expirarInactivas()).resolves.toEqual({
      revisadas: 3,
      expiradas: 2,
      omitidas: 1,
    });
  });

  it('un error inesperado NO se esconde: sale para que se vea en el log', async () => {
    await expect(armar({ 1: 'ok', 2: 'roto' }).expirarInactivas()).rejects.toThrow(/la BD se cayó/);
  });
});
