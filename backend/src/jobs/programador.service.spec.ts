import { createTask, validate } from 'node-cron';
import type { ExpiracionService, ResultadoExpiracion } from './expiracion.service.js';
import { PATRON_EXPIRACION, ProgramadorService } from './programador.service.js';

// La lógica de qué expira está probada en expiracion.service.spec y en
// test/db/expiracion.db-spec. Aquí: el horario y cómo el programador la llama.

const conLotes = (lotes: (ResultadoExpiracion | Error)[]) => {
  const llamadas = { n: 0 };
  const expiracion = {
    expirarInactivas: async () => {
      const r = lotes[llamadas.n++] ?? { revisadas: 0, expiradas: 0, omitidas: 0 };
      if (r instanceof Error) throw r;
      return r;
    },
  } as unknown as ExpiracionService;
  return { servicio: new ProgramadorService(expiracion), llamadas };
};

describe('ProgramadorService', () => {
  it('el patrón es válido y la próxima corrida es a las 3:00 a. m. hora de Colombia', async () => {
    expect(validate(PATRON_EXPIRACION)).toBe(true);
    // createTask arma la tarea SIN arrancarla (así la prueba no deja un reloj vivo).
    const tarea = createTask(PATRON_EXPIRACION, () => undefined, { timezone: 'America/Bogota' });
    const [proxima] = tarea.getNextRuns(1); // getNextRun() da null si la tarea no arrancó
    await tarea.destroy();
    // Colombia es UTC−5 todo el año (sin horario de verano): 3:00 allá = 8:00 UTC.
    expect([proxima.getUTCHours(), proxima.getUTCMinutes()]).toEqual([8, 0]);
    expect(proxima.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3_600_000);
  });

  it('un lote con menos de 500 revisadas termina en una sola llamada', async () => {
    const { servicio, llamadas } = conLotes([{ revisadas: 12, expiradas: 11, omitidas: 1 }]);
    expect(await servicio.ejecutarExpiracion()).toEqual({ expiradas: 11, omitidas: 1, lotes: 1 });
    expect(llamadas.n).toBe(1);
  });

  it('si se acumularon más de 500, repite hasta vaciar (en la misma noche)', async () => {
    const lleno = { revisadas: 500, expiradas: 500, omitidas: 0 };
    const { servicio } = conLotes([lleno, lleno, { revisadas: 30, expiradas: 30, omitidas: 0 }]);
    expect(await servicio.ejecutarExpiracion()).toEqual({ expiradas: 1030, omitidas: 0, lotes: 3 });
  });

  it('tiene un tope de 20 lotes por noche (no se queda en un ciclo)', async () => {
    const lleno = { revisadas: 500, expiradas: 0, omitidas: 500 };
    const { servicio, llamadas } = conLotes(Array.from({ length: 50 }, () => lleno));
    expect((await servicio.ejecutarExpiracion()).lotes).toBe(20);
    expect(llamadas.n).toBe(20);
  });

  it('si la BD falla, NO lanza (el servidor sigue) y devuelve lo que alcanzó', async () => {
    const { servicio } = conLotes([
      { revisadas: 500, expiradas: 500, omitidas: 0 },
      new Error('la BD se cayó'),
    ]);
    await expect(servicio.ejecutarExpiracion()).resolves.toEqual({
      expiradas: 500,
      omitidas: 0,
      lotes: 1,
    });
  });

  it('en NODE_ENV=test no programa nada, y apagar sin tarea no falla', async () => {
    const { servicio } = conLotes([]);
    servicio.onApplicationBootstrap();
    expect((servicio as unknown as { tarea: unknown }).tarea).toBeNull();
    await expect(servicio.onModuleDestroy()).resolves.toBeUndefined();
  });
});
