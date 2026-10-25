import { HttpStatus, PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { DetalleError, ErrorApp } from '../errores/error-app.js';

// Mensajes de Zod en español para los campos que no traen un mensaje propio.
// Se configura UNA vez para toda la app (z.config es global).
z.config(z.locales.es());

// Un *Pipe* de Nest recibe un dato de la petición (el cuerpo, la URL…) ANTES de que
// llegue al controlador, y puede transformarlo o rechazarlo. Este lo valida con Zod:
//
//   @Post('registro')
//   registrar(@Body(new ValidacionZod(esquemaRegistro)) datos: DatosRegistro) { … }
//
// Si los datos no cumplen el esquema, el controlador ni se ejecuta: responde 400
// con un `detalle` por cada campo con problemas.
export class ValidacionZod<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly esquema: T) {}

  transform(valor: unknown): z.output<T> {
    const resultado = this.esquema.safeParse(valor);
    if (resultado.success) {
      // Se devuelve el dato YA procesado por Zod (con .trim(), .toLowerCase(), valores
      // por defecto…) y sin los campos que el esquema no conoce: el controlador nunca
      // ve un campo "extra" que alguien haya colado, como { "rol": "ADMIN" }.
      return resultado.data;
    }
    throw new ErrorApp(
      HttpStatus.BAD_REQUEST,
      'SOLICITUD_INVALIDA',
      'Revisa los datos enviados.',
      aDetalles(resultado.error),
    );
  }
}

export function aDetalles(error: z.ZodError): DetalleError[] {
  return error.issues.map((p) => ({
    // ['contacto', 'correo'] → 'contacto.correo'; sin ruta = el cuerpo completo.
    campo: p.path.length ? p.path.join('.') : '(cuerpo)',
    mensaje: p.message,
  }));
}
