// Esquemas de Zod de lo que llega a las rutas de reclamación, chat y entrega.
import { z } from 'zod';
import { LARGO_MAXIMO } from './mensajes.service.js';

export const esquemaReclamar = z.object({
  respuesta_detalle: z
    .string({ error: 'Describe el detalle que solo el dueño conoce' })
    .trim()
    .min(3, { error: 'Describe el detalle que solo el dueño conoce' })
    .max(1000, { error: 'La respuesta es demasiado larga' }),
  evidencia_url: z.url({ error: 'La evidencia debe ser un enlace válido' }).optional(),
});
export type DatosReclamar = z.output<typeof esquemaReclamar>;

export const esquemaResolver = z.object({
  // ACEPTAR y RECHAZAR: el autor, sobre una PENDIENTE. CANCELAR: cualquiera de las dos
  // partes, sobre una ACEPTADA cuya entrega no se completó (pregunta 13.4).
  decision: z.enum(['ACEPTAR', 'RECHAZAR', 'CANCELAR'], {
    error: 'La decisión debe ser ACEPTAR, RECHAZAR o CANCELAR',
  }),
});
export type DatosResolver = z.output<typeof esquemaResolver>;

export const esquemaMensaje = z.object({
  contenido: z
    .string({ error: 'Escribe un mensaje' })
    .trim()
    .min(1, { error: 'Escribe un mensaje' })
    .max(LARGO_MAXIMO, { error: `Máximo ${LARGO_MAXIMO} caracteres` }),
});
export type DatosMensaje = z.output<typeof esquemaMensaje>;
