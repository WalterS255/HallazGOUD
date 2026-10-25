import { HttpException, HttpStatus } from '@nestjs/common';

// Un problema concreto en un campo de lo que envió el usuario (ver ValidacionZod).
export interface DetalleError {
  campo: string;
  mensaje: string;
}

// Error de negocio con un código propio y un mensaje para el usuario.
// Los servicios lanzan esto cuando una regla no se cumple, por ejemplo:
//   throw new ErrorApp(HttpStatus.CONFLICT, 'RECLAMACION_DUPLICADA', 'Ya tienes una reclamación pendiente.');
// El filtro global lo convierte en { error: { codigo, mensaje, detalles? } }.
export class ErrorApp extends HttpException {
  constructor(
    estado: HttpStatus,
    readonly codigo: string,
    mensaje: string,
    // Opcional: lista de campos con problemas, para que el formulario los marque.
    readonly detalles?: DetalleError[],
  ) {
    super(detalles ? { codigo, mensaje, detalles } : { codigo, mensaje }, estado);
    // HttpException arma `message` buscando un campo "message" (en inglés) en la
    // respuesta; como el nuestro se llama "mensaje", pondría el nombre de la clase
    // ("Error App"). Se fija a mano para que logs y pruebas vean el texto real.
    this.message = mensaje;
  }
}
