import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { schedule, type ScheduledTask } from 'node-cron';
import { config } from '../config/configuracion.js';
import { ExpiracionService } from './expiracion.service.js';
import { LimpiezaImagenesService } from './limpieza-imagenes.service.js';

// Cuándo corre la expiración a 90 días (RF-12): todos los días a las 3:00 a. m. en hora
// de Colombia, la de menos uso. Formato cron: minuto hora día-del-mes mes día-de-la-semana.
export const PATRON_EXPIRACION = '0 3 * * *';
// Fotos de entregas de hace más de 90 días (§6.5): media hora después, para no pisarse.
export const PATRON_LIMPIEZA = '30 3 * * *';

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
  private tareas: ScheduledTask[] = [];

  constructor(
    private readonly expiracion: ExpiracionService,
    private readonly limpieza: LimpiezaImagenesService,
  ) {}

  onApplicationBootstrap(): void {
    if (config.entorno === 'test') return;
    const programar = (nombre: string, patron: string, f: () => Promise<unknown>) => {
      const t = schedule(patron, f, {
        name: nombre,
        timezone: config.zonaHoraria,
        noOverlap: true,
      });
      this.tareas.push(t);
      this.logger.log(
        `${nombre} a ${patron} (${config.zonaHoraria}); próxima: ${t.getNextRun()?.toISOString()}`,
      );
    };
    programar('Expiración', PATRON_EXPIRACION, () => this.ejecutarExpiracion());
    programar('Limpieza de imágenes', PATRON_LIMPIEZA, () => this.ejecutarLimpieza());
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.tareas) await t.destroy();
    this.tareas = [];
  }

  // Pública para poder probarla. Nunca lanza: un fallo se registra y se reintenta mañana.
  async ejecutarLimpieza(): Promise<{ publicaciones: number; imagenes: number } | null> {
    try {
      return await this.limpieza.limpiarEntregadas();
    } catch (e) {
      this.logger.error(
        `La limpieza de imágenes falló; se reintenta mañana: ${(e as Error).message}`,
      );
      return null;
    }
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
