import { Injectable, Logger } from '@nestjs/common';
import { ErrorApp } from '../comun/errores/error-app.js';
import { PrismaService } from '../lib/prisma/prisma.service.js';
import { PublicacionesService } from '../modules/publicaciones/publicaciones.service.js';

export const DIAS_SIN_ACTIVIDAD = 90; // RF-12

export interface ResultadoExpiracion {
  revisadas: number;
  expiradas: number;
  omitidas: number; // cambiaron de estado entre la búsqueda y el cambio (otra petición ganó)
}

// Tarea del cron de expiración (RF-12). Aquí solo está la LÓGICA: el programador
// que la ejecuta una vez al día se conecta aparte (falta aprobar la dependencia).
@Injectable()
export class ExpiracionService {
  private readonly logger = new Logger(ExpiracionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publicaciones: PublicacionesService,
  ) {}

  async expirarInactivas(): Promise<ResultadoExpiracion> {
    // now() de la BD, no new Date(): el límite y ultima_actividad salen del mismo
    // reloj (regla de fechas, CLAUDE.md Fase C). LIMIT: un lote por corrida, para
    // no tener una transacción gigante si se acumularon miles.
    const vencidas = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM publicacion
      WHERE estado = 'ACTIVA'
        AND ultima_actividad < now() - make_interval(days => ${DIAS_SIN_ACTIVIDAD})
      ORDER BY ultima_actividad
      LIMIT 500`;

    const resultado: ResultadoExpiracion = {
      revisadas: vencidas.length,
      expiradas: 0,
      omitidas: 0,
    };
    // Una transacción por publicación: si una falla, las demás igual se expiran.
    for (const { id } of vencidas) {
      try {
        await this.publicaciones.cambiarEstado(id, 'EXPIRADA', { id_usuario: null });
        resultado.expiradas++;
      } catch (error) {
        // Entre el SELECT y el cambio, alguien pudo aceptar una reclamación: la
        // máquina de estados lo rechaza y está bien, no es un fallo del cron.
        if (error instanceof ErrorApp && error.codigo === 'TRANSICION_INVALIDA') {
          resultado.omitidas++;
        } else {
          throw error;
        }
      }
    }
    this.logger.log(resultado, 'Expiración');
    return resultado;
  }
}
