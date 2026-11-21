import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { schedule, type ScheduledTask } from 'node-cron';
import { config } from '../config/configuracion.js';
import { ExpiracionService } from './expiracion.service.js';

// Cuándo corre la expiración a 90 días (RF-12): todos los días a las 3:00 a. m. en hora
// de Colombia, la de menos uso. Formato cron: minuto hora día-del-mes mes día-de-la-semana.
export const PATRON_EXPIRACION = '0 3 * * *';

// expirarInactivas() procesa hasta 500 por llamada. Si se acumularon más (por ejemplo,
// el servidor estuvo apagado semanas), se repite en la misma noche, con un tope para
// no quedarse en un ciclo si algo raro pasa.
const TAMANO_LOTE = 500;
const MAX_LOTES_POR_NOCHE = 20;

// El "reloj" que dispara las tareas programadas (§4: node-cron dentro del backend).
// - Nunca tumba el servidor: un error se registra y se reintenta la noche siguiente.
// - noOverlap: si una corrida sigue trabajando, la siguiente no arranca encima.
// - En NODE_ENV=test no se programa nada: ninguna prueba debe depender de la hora.
// - Con UNA instancia del backend (como hoy). Con varias, cada una correría la tarea:
//   no rompe nada (cambiarEstado bloquea la fila y cuenta la repetida como "omitida"),
//   pero habría que dejar el reloj en una sola.
@Injectable()
export class ProgramadorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProgramadorService.name);
  private tarea: ScheduledTask | null = null;

  constructor(private readonly expiracion: ExpiracionService) {}

  onApplicationBootstrap(): void {
    if (config.entorno === 'test') return;
    this.tarea = schedule(PATRON_EXPIRACION, () => this.ejecutarExpiracion(), {
      name: 'expiracion-90-dias',
      timezone: config.zonaHoraria,
      noOverlap: true,
    });
    this.logger.log(
      `Expiración a ${PATRON_EXPIRACION} (${config.zonaHoraria}); próxima: ${this.tarea.getNextRun()?.toISOString()}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.tarea?.destroy();
    this.tarea = null;
  }

  // Pública para poder probarla (y, si hiciera falta, dispararla a mano). Nunca lanza.
  async ejecutarExpiracion(): Promise<{ expiradas: number; omitidas: number; lotes: number }> {
    const total = { expiradas: 0, omitidas: 0, lotes: 0 };
    try {
      while (total.lotes < MAX_LOTES_POR_NOCHE) {
        const r = await this.expiracion.expirarInactivas();
        total.lotes++;
        total.expiradas += r.expiradas;
        total.omitidas += r.omitidas;
        if (r.revisadas < TAMANO_LOTE) break; // no quedan más
      }
      this.logger.log(
        `Expiración: ${total.expiradas} expiradas, ${total.omitidas} omitidas en ${total.lotes} lote(s)`,
      );
    } catch (e) {
      this.logger.error(`La expiración falló; se reintenta mañana: ${(e as Error).message}`);
    }
    return total;
  }
}
