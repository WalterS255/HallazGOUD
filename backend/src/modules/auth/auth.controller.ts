import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, Post } from '@nestjs/common';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { LimiteEstricto } from '../../comun/limites/limites.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import {
  type DatosLogin,
  type DatosRecuperar,
  type DatosRegistro,
  type DatosRestablecer,
  esquemaLogin,
  esquemaRecuperar,
  esquemaRegistro,
  esquemaRestablecer,
  esquemaToken,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

// Controladores "finos": validan con Zod, toman la IP y llaman al servicio.
// Ninguna regla de negocio vive aquí.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @LimiteEstricto()
  @Post('registro')
  registrar(@Body(new ValidacionZod(esquemaRegistro)) datos: DatosRegistro, @Ip() ip: string) {
    return this.auth.registrar(datos, { ip });
  }

  @Get('verificar/:token')
  verificar(@Param('token', new ValidacionZod(esquemaToken)) token: string) {
    return this.auth.verificar(token);
  }

  @LimiteEstricto()
  @HttpCode(HttpStatus.OK) // un login no "crea" nada: 200, no el 201 que Nest pone a los POST
  @Post('login')
  login(@Body(new ValidacionZod(esquemaLogin)) datos: DatosLogin, @Ip() ip: string) {
    return this.auth.login(datos, { ip });
  }

  @LimiteEstricto()
  @HttpCode(HttpStatus.ACCEPTED) // 202: "recibido"; no dice si el correo existe
  @Post('recuperar')
  recuperar(@Body(new ValidacionZod(esquemaRecuperar)) datos: DatosRecuperar) {
    return this.auth.recuperar(datos);
  }

  @LimiteEstricto()
  @HttpCode(HttpStatus.OK)
  @Post('restablecer')
  restablecer(@Body(new ValidacionZod(esquemaRestablecer)) datos: DatosRestablecer) {
    return this.auth.restablecer(datos);
  }
}

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly auth: AuthService) {}

  // RF-05 (lectura). Editar el perfil (PUT) queda para después.
  @Autenticado()
  @Get('me')
  yo(@UsuarioActual() usuario: UsuarioSesion) {
    return this.auth.perfil(usuario.id);
  }
}
