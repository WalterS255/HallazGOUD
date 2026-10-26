import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import { esquemaId } from '../publicaciones/publicaciones.schemas.js';
import { NotificacionesService } from './notificaciones.service.js';

// ?no_leidas=true → solo las que faltan por leer. En la URL todo es texto: "true"/"false".
const esquemaListar = z.object({
  no_leidas: z
    .enum(['true', 'false'], { error: 'no_leidas debe ser true o false' })
    .default('false')
    .transform((v) => v === 'true'),
});

@Autenticado()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  // Solo las MÍAS: el id sale del token, nunca de la URL.
  @Get()
  listar(
    @Query(new ValidacionZod(esquemaListar)) q: z.output<typeof esquemaListar>,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.notificaciones.listar(usuario.id, q.no_leidas);
  }

  // Va ANTES de ':id' para que "leer-todas" no se tome como un id.
  @HttpCode(HttpStatus.OK)
  @Post('leer-todas')
  leerTodas(@UsuarioActual() usuario: UsuarioSesion) {
    return this.notificaciones.marcarTodas(usuario.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':id')
  async marcarLeida(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ): Promise<void> {
    await this.notificaciones.marcarLeida(id, usuario.id);
  }
}
