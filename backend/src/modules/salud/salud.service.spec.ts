import { HttpStatus } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import type { PrismaService } from '../../lib/prisma/prisma.service.js';
import { SaludService } from './salud.service.js';

// Prueba unitaria con un Prisma FALSO: así se prueba qué hace el servicio cuando
// la BD responde y cuando falla, sin necesitar una base de datos de verdad.
function servicioCon(queryRaw: () => Promise<unknown>): SaludService {
  const prismaFalso = { $queryRaw: queryRaw } as unknown as PrismaService;
  return new SaludService(prismaFalso);
}

describe('SaludService.verificarBd', () => {
  it('responde conectada con la latencia cuando la BD contesta', async () => {
    const estado = await servicioCon(async () => [{ '?column?': 1 }]).verificarBd();
    expect(estado).toMatchObject({ ok: true, bd: 'conectada' });
    expect(estado.latencia_ms).toBeGreaterThanOrEqual(0);
  });

  it('lanza 503 BD_NO_DISPONIBLE (sin detalles internos) cuando la BD falla', async () => {
    const servicio = servicioCon(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5433 password=secreta');
    });
    const error = await servicio.verificarBd().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApp);
    expect((error as ErrorApp).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((error as ErrorApp).getResponse()).toEqual({
      codigo: 'BD_NO_DISPONIBLE',
      mensaje: 'La base de datos no responde.',
    });
  });
});
