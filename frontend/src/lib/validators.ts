// Filtros del catálogo leídos de la URL. Mismas reglas que esquemaFiltrosCatalogo del backend,
// para no enviarle parámetros que vaya a rechazar.
import { z } from 'zod';

const opcional = <T extends z.ZodTypeAny>(esquema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), esquema.optional());

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ESTADOS_FILTRO = ['ACTIVA', 'EN_RECLAMACION', 'ENTREGADA', 'EXPIRADA'] as const;
export const ORDENES = ['recientes', 'antiguos', 'relevancia'] as const;

export const filtrosSchema = z.object({
  q: opcional(z.string().trim().max(100)),
  tipo: opcional(z.enum(['PERDIDO', 'ENCONTRADO'])),
  id_categoria: opcional(z.coerce.number().int().positive()),
  id_sede: opcional(z.coerce.number().int().positive()),
  estado: opcional(z.enum(ESTADOS_FILTRO)),
  desde: opcional(fecha),
  hasta: opcional(fecha),
  orden: opcional(z.enum(ORDENES)),
  pagina: opcional(z.coerce.number().int().min(1).max(1000)),
});

export type Filtros = z.infer<typeof filtrosSchema>;
