import { Controller, Get } from '@nestjs/common';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { MiCuentaService } from './mi-cuenta.service.js';

// Comparte el prefijo /usuarios/me con UsuariosController (módulo auth): Nest junta
// las rutas de los dos. Aquí van las listas de "lo mío"; allá, los datos de la cuenta.
@Autenticado()
@Controller('usuarios/me')
export class MiCuentaController {
  constructor(private readonly miCuenta: MiCuentaService) {}

  @Get('publicaciones')
  publicaciones(@UsuarioActual() usuario: UsuarioSesion) {
    return this.miCuenta.publicaciones(usuario.id);
  }

  @Get('reclamaciones')
  reclamaciones(@UsuarioActual() usuario: UsuarioSesion) {
    return this.miCuenta.reclamaciones(usuario.id);
  }

  @Get('conversaciones')
  conversaciones(@UsuarioActual() usuario: UsuarioSesion) {
    return this.miCuenta.conversaciones(usuario.id);
  }
}
