import { Controller, Get } from '@nestjs/common';

// Un controlador recibe las peticiones HTTP de una ruta y devuelve la respuesta.
// @Controller('salud') + el prefijo global 'api' = /api/salud
@Controller('salud')
export class SaludController {
  @Get()
  verificar(): { ok: true } {
    return { ok: true };
  }
}
