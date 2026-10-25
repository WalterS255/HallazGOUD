import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

// Un controlador recibe las peticiones HTTP de una ruta y devuelve la respuesta.
// @Controller('salud') + el prefijo global 'api' = /api/salud
//
// Sin rate limit: Docker y el monitoreo la consultan cada pocos segundos, y si
// el límite la bloqueara creerían que el servidor está caído.
@SkipThrottle()
@Controller('salud')
export class SaludController {
  @Get()
  verificar(): { ok: true } {
    return { ok: true };
  }
}
