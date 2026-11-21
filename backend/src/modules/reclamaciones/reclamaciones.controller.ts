import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import { esquemaId } from '../publicaciones/publicaciones.schemas.js';
import { MensajesService } from './mensajes.service.js';
import {
  type DatosMensaje,
  type DatosReclamar,
  type DatosResolver,
  esquemaMensaje,
  esquemaReclamar,
  esquemaResolver,
} from './reclamaciones.schemas.js';
import { ReclamacionesService } from './reclamaciones.service.js';

// Todas las rutas necesitan sesión. Quién puede qué (autor, reclamante, las dos
// partes) lo decide cada servicio, porque no son roles sino relaciones (§2).
@Autenticado()
@Controller()
export class ReclamacionesController {
  constructor(
    private readonly reclamaciones: ReclamacionesService,
    private readonly mensajes: MensajesService,
  ) {}

  // RF-18: reclamar un ENCONTRADO describiendo el detalle reservado.
  @Post('publicaciones/:id/reclamaciones')
  reclamar(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaReclamar)) datos: DatosReclamar,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.reclamaciones.crear({ id_publicacion: id, id_reclamante: usuario.id, ...datos });
  }

  // RF-19: el autor ve las respuestas junto al detalle reservado.
  @Get('publicaciones/:id/reclamaciones')
  deMiPublicacion(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.reclamaciones.paraElAutor(id, usuario.id);
  }

  // Ficha para las dos partes: quién es quién y en qué va la entrega (pantalla del chat).
  @Get('reclamaciones/:id')
  detalle(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.reclamaciones.detalle(id, usuario.id);
  }

  // RF-19/20: aceptar (abre el chat) o rechazar.
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('reclamaciones/:id')
  async resolver(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaResolver)) datos: DatosResolver,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ): Promise<void> {
    await this.reclamaciones.resolver(id, usuario.id, datos.decision, ip);
  }

  // RF-20 · §6.4: el chat de las dos partes.
  @Get('reclamaciones/:id/mensajes')
  hilo(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.mensajes.listar(id, usuario.id);
  }

  @Post('reclamaciones/:id/mensajes')
  enviar(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaMensaje)) datos: DatosMensaje,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.mensajes.enviar(id, usuario.id, datos.contenido);
  }

  // RF-21 · §6.5: cada parte confirma; con las dos, ENTREGADA.
  @HttpCode(HttpStatus.OK)
  @Post('reclamaciones/:id/entrega')
  confirmarEntrega(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ) {
    return this.reclamaciones.confirmarEntrega(id, usuario.id, ip);
  }
}
