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
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Roles, type UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import { esquemaId } from '../publicaciones/publicaciones.schemas.js';
import { ModeracionService } from './moderacion.service.js';

const esquemaReportar = z.object({
  id_publicacion: esquemaId,
  motivo: z
    .string({ error: 'Cuéntanos por qué la reportas' })
    .trim()
    .min(5, { error: 'Cuéntanos por qué la reportas (al menos 5 caracteres)' })
    .max(500, { error: 'El motivo es demasiado largo' }),
});
const esquemaBandeja = z.object({
  estado: z.enum(['PENDIENTE', 'RESUELTO', 'DESCARTADO']).default('PENDIENTE'),
});
const esquemaResolver = z.object({
  decision: z.enum(['OCULTAR', 'DESCARTAR'], { error: 'La decisión debe ser OCULTAR o DESCARTAR' }),
  motivo: z.string().trim().max(300, { error: 'El motivo es demasiado largo' }).optional(),
});

// RF-26: cualquier usuario con sesión reporta.
@Controller('reportes')
export class ReportesController {
  constructor(private readonly moderacion: ModeracionService) {}

  @Autenticado()
  @Post()
  reportar(
    @Body(new ValidacionZod(esquemaReportar)) datos: z.output<typeof esquemaReportar>,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.moderacion.reportar({ ...datos, id_reportante: usuario.id });
  }
}

// RF-27: la bandeja y la decisión, para moderadores (y admins).
@Roles('MODERADOR', 'ADMIN')
@Controller('admin/reportes')
export class ModeracionController {
  constructor(private readonly moderacion: ModeracionService) {}

  @Get()
  bandeja(@Query(new ValidacionZod(esquemaBandeja)) q: z.output<typeof esquemaBandeja>) {
    return this.moderacion.bandeja(q.estado);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(':id')
  async resolver(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaResolver)) datos: z.output<typeof esquemaResolver>,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ): Promise<void> {
    await this.moderacion.resolver(id, usuario.id, datos.decision, datos.motivo, ip);
  }
}
