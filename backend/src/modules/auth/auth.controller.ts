import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MAX_BYTES } from '../../lib/imagenes/procesar.js';
import { PerfilService } from './perfil.service.js';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { LimiteEstricto } from '../../comun/limites/limites.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import {
  type DatosLogin,
  type DatosRecuperar,
  type DatosEditarPerfil,
  type DatosRegistro,
  type DatosRestablecer,
  esquemaEditarPerfil,
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
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('reenviar-verificacion')
  reenviar(@Body(new ValidacionZod(esquemaRecuperar)) datos: DatosRecuperar) {
    return this.auth.reenviarVerificacion(datos);
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
  constructor(private readonly perfil: PerfilService) {}

  @Autenticado()
  @Get('me')
  yo(@UsuarioActual() usuario: UsuarioSesion) {
    return this.perfil.ver(usuario.id);
  }

  // RF-05: datos básicos y preferencias (el correo no se cambia).
  @Autenticado()
  @Put('me')
  editar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidacionZod(esquemaEditarPerfil)) datos: DatosEditarPerfil,
  ) {
    return this.perfil.editar(usuario.id, datos);
  }

  // multipart/form-data con el campo "foto".
  @Autenticado()
  @Post('me/foto')
  @UseInterceptors(
    FileInterceptor('foto', { limits: { fileSize: MAX_BYTES, files: 1, fields: 0 } }),
  )
  cambiarFoto(
    @UsuarioActual() usuario: UsuarioSesion,
    @UploadedFile() archivo: { buffer: Buffer; originalname: string } | undefined,
  ) {
    return this.perfil.cambiarFoto(usuario.id, archivo);
  }

  @Autenticado()
  @Delete('me/foto')
  quitarFoto(@UsuarioActual() usuario: UsuarioSesion) {
    return this.perfil.quitarFoto(usuario.id);
  }
}

// Fotos de perfil, públicas (se ven junto al nombre). Sin rate limit, como las de publicaciones.
@SkipThrottle()
@Controller('imagenes')
export class FotosPerfilController {
  constructor(private readonly perfil: PerfilService) {}

  @Get('usuarios/:id/:archivo')
  async ver(
    @Param('id') id: string,
    @Param('archivo') archivo: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const foto = await this.perfil.leerFoto(`usuarios/${id}/${archivo}`);
    res.set({
      'Content-Type': foto.tipo,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(foto.contenido);
  }
}
