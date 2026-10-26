import { z } from 'zod';

// ?desde=2026-01-01&hasta=2026-07-01 (opcionales: sin ellas, los últimos 12 meses).
export const esquemaPeriodo = z.object({
  desde: z.coerce.date({ error: 'Fecha inicial inválida' }).optional(),
  hasta: z.coerce.date({ error: 'Fecha final inválida' }).optional(),
});
export type PeriodoHttp = z.output<typeof esquemaPeriodo>;
