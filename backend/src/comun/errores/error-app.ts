import { HttpException, HttpStatus } from '@nestjs/common';

// Error de negocio con un código propio y un mensaje para el usuario.
// Los servicios lanzan esto cuando una regla no se cumple, por ejemplo:
//   throw new ErrorApp(HttpStatus.CONFLICT, 'RECLAMACION_DUPLICADA', 'Ya tienes una reclamación pendiente.');
// El filtro global lo convierte en { error: { codigo, mensaje } }.
export class ErrorApp extends HttpException {
  constructor(
    estado: HttpStatus,
    readonly codigo: string,
    mensaje: string,
  ) {
    super({ codigo, mensaje }, estado);
  }
}
