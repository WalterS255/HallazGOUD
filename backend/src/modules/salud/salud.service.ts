import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorApp } from '../../comun/errores/error-app.js';
import { PrismaService } from '../../lib/prisma/prisma.service.js';

export interface EstadoBd {
  ok: true;
  bd: 'conectada';
  latencia_ms: number;
}

@Injectable()
export class SaludService {
  private readonly logger = new Logger(SaludService.name);

  constructor(private readonly prisma: PrismaService) {}

  // La consulta más barata posible: si responde, la BD está viva y las credenciales sirven.
  async verificarBd(): Promise<EstadoBd> {
    const inicio = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      // Al log el detalle (para depurar); al usuario, un mensaje sin datos internos.
      this.logger.error(error);
      throw new ErrorApp(
        HttpStatus.SERVICE_UNAVAILABLE,
        'BD_NO_DISPONIBLE',
        'La base de datos no responde.',
      );
    }
    return { ok: true, bd: 'conectada', latencia_ms: Math.round(performance.now() - inicio) };
  }
}
