import { Controller, Get } from '@nestjs/common';
import { type EstadoBd, SaludService } from './salud.service.js';

// Un controlador recibe las peticiones HTTP de una ruta y devuelve la respuesta.
// @Controller('salud') + el prefijo global 'api' = /api/salud
@Controller('salud')
export class SaludController {
  constructor(private readonly salud: SaludService) {}

  // "¿El servidor está vivo?" No toca la BD: responde aunque ella esté caída.
  @Get()
  verificar(): { ok: true } {
    return { ok: true };
  }

  // "¿Y llega a la base de datos?" Si no, 503 con el código BD_NO_DISPONIBLE.
  @Get('bd')
  verificarBd(): Promise<EstadoBd> {
    return this.salud.verificarBd();
  }
}
