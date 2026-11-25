// Esquemas de Zod para crear y editar publicaciones (RF-06, RF-07, RF-09, RF-10).
// Validan FORMA. Lo que necesita la BD (¿la categoría existe y está activa?, ¿es el
// autor?) va en gestion.service.ts.
import { z } from 'zod';

const titulo = z
  .string({ error: 'Escribe un título' })
  .trim()
  .min(5, { error: 'El título debe tener al menos 5 caracteres' })
  .max(100, { error: 'El título puede tener máximo 100 caracteres' });

const descripcion = z
  .string({ error: 'Escribe una descripción' })
  .trim()
  .min(10, { error: 'Describe el objeto con al menos 10 caracteres' })
  .max(2000, { error: 'La descripción puede tener máximo 2000 caracteres' });

const id = (que: string) =>
  z.coerce
    .number({ error: `Elige ${que}` })
    .int({ error: `Elige ${que}` })
    .positive({ error: `Elige ${que}` });

// Fecha y hora del suceso (ajuste 5.2.2: un solo timestamptz). Llega como texto ISO
// ("2026-10-25T14:30:00-05:00"); z.coerce.date la convierte en Date.
// Que no sea futura se revisa en el servicio, contra el MISMO reloj con que se guarda
// fecha_creacion (si se revisara aquí, unos milisegundos de diferencia bastarían
// para que el CHECK fecha_suceso <= fecha_creacion fallara).
const fechaSuceso = z.coerce.date({ error: 'Indica la fecha y hora (aproximada)' });

const detalleReservado = z
  .string({ error: 'Escribe el detalle reservado' })
  .trim()
  .min(3, { error: 'El detalle reservado debe tener al menos 3 caracteres' })
  .max(500, { error: 'El detalle reservado puede tener máximo 500 caracteres' });

// Dónde exactamente, en texto libre ("cuarto piso, al lado de una mesa").
const ubicacion = z
  .string({ error: 'Describe dónde exactamente' })
  .trim()
  .min(3, { error: 'Describe el lugar con al menos 3 caracteres' })
  .max(200, { error: 'La ubicación puede tener máximo 200 caracteres' });

// El lugar llega de UNA de dos formas (2026-11-24):
//  - id_sede + ubicacion: lo que usa el formulario. La publicación queda en el lugar
//    "General" de esa sede (gestion.service.ts) y el detalle va en el texto.
//  - id_lugar: un edificio del catálogo, como antes (sigue sirviendo).
const comunes = {
  titulo,
  descripcion,
  id_categoria: id('una categoría'),
  id_lugar: id('un lugar').optional(),
  id_sede: id('una sede').optional(),
  ubicacion: ubicacion.optional(),
  fecha_suceso: fechaSuceso,
};

type ConLugar = { id_lugar?: number; id_sede?: number; ubicacion?: string };

// Una sola forma de indicar el lugar; con la sede, el texto es obligatorio.
const revisarLugar = (d: ConLugar, ctx: z.RefinementCtx, obligatorio: boolean) => {
  if (d.id_lugar !== undefined && d.id_sede !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['id_sede'],
      message: 'Indica la sede o el lugar, no los dos',
    });
  } else if (obligatorio && d.id_lugar === undefined && d.id_sede === undefined) {
    ctx.addIssue({ code: 'custom', path: ['id_sede'], message: 'Elige una sede' });
  }
  if (obligatorio && d.id_sede !== undefined && d.ubicacion === undefined) {
    ctx.addIssue({ code: 'custom', path: ['ubicacion'], message: 'Describe dónde exactamente' });
  }
};

// Unión "discriminada" por `tipo`: según lo que diga tipo, Zod aplica una forma u otra.
// RF-09: el detalle reservado es OBLIGATORIO en un ENCONTRADO y NO EXISTE en un PERDIDO
// (la BD también lo impide con un trigger; aquí el usuario recibe un mensaje claro).
export const esquemaCrear = z
  .discriminatedUnion(
    'tipo',
    [
      z.object({ tipo: z.literal('ENCONTRADO'), ...comunes, detalle_reservado: detalleReservado }),
      z.object({
        tipo: z.literal('PERDIDO'),
        ...comunes,
        // En Zod 4 una clave z.undefined() sigue siendo OBLIGATORIA (exige que la clave
        // exista). Con .optional() se acepta que falte; si viene con un valor, se rechaza.
        detalle_reservado: z
          .undefined({
            error: 'Un objeto perdido no lleva detalle reservado (solo los encontrados)',
          })
          .optional(),
      }),
    ],
    { error: 'Indica si el objeto es PERDIDO o ENCONTRADO' },
  )
  .superRefine((d, ctx) => revisarLugar(d, ctx, true));

// Editar: todo opcional, pero al menos un campo. El TIPO no se puede cambiar
// (convertir un PERDIDO en ENCONTRADO cambiaría quién puede reclamar).
export const esquemaEditar = z
  .object({
    titulo: titulo.optional(),
    descripcion: descripcion.optional(),
    id_categoria: id('una categoría').optional(),
    id_lugar: id('un lugar').optional(),
    id_sede: id('una sede').optional(),
    ubicacion: ubicacion.optional(),
    fecha_suceso: fechaSuceso.optional(),
    detalle_reservado: detalleReservado.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    error: 'No hay nada que cambiar',
  })
  // Al editar todo es opcional: solo se impide mandar la sede y el lugar a la vez.
  .superRefine((d, ctx) => revisarLugar(d, ctx, false));

export const esquemaIdPublicacion = id('una publicación');

export type DatosCrear = z.output<typeof esquemaCrear>;
export type DatosEditar = z.output<typeof esquemaEditar>;
