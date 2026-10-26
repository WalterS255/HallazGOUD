// Esquemas de Zod de lo que llega a /api/publicaciones/*.
// OJO: en la URL todo llega como TEXTO ("?pagina=2" es "2", no 2). Por eso
// z.coerce convierte a número o fecha antes de validar.
import { z } from 'zod';
import { LIMITE_MAXIMO, LIMITE_POR_DEFECTO } from './catalogo.service.js';

// Un :id de la ruta: entero positivo. "abc", "-1" o "1.5" → 400 antes de tocar la BD.
export const esquemaId = z.coerce
  .number({ error: 'El identificador debe ser un número' })
  .int({ error: 'El identificador debe ser un número entero' })
  .positive({ error: 'El identificador debe ser positivo' });

const idOpcional = z.coerce.number().int().positive().optional();

export const esquemaFiltrosCatalogo = z
  .object({
    tipo: z.enum(['PERDIDO', 'ENCONTRADO']).optional(),
    id_categoria: idOpcional,
    id_sede: idOpcional,
    estado: z.enum(['ACTIVA', 'EN_RECLAMACION', 'ENTREGADA', 'EXPIRADA', 'RETIRADA']).optional(),
    desde: z.coerce.date({ error: 'Fecha inicial inválida' }).optional(),
    hasta: z.coerce.date({ error: 'Fecha final inválida' }).optional(),
    q: z.string().trim().max(100, { error: 'La búsqueda es demasiado larga' }).optional(),
    orden: z.enum(['recientes', 'antiguos', 'relevancia']).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    limite: z.coerce
      .number()
      .int()
      .min(1)
      .max(LIMITE_MAXIMO, { error: `Máximo ${LIMITE_MAXIMO} por página` })
      .default(LIMITE_POR_DEFECTO),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    error: 'La fecha inicial debe ser anterior a la final',
    path: ['desde'],
  });

export type FiltrosCatalogoHttp = z.output<typeof esquemaFiltrosCatalogo>;
