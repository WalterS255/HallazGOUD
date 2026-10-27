import {
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import { esquemaIdPublicacion } from './gestion.schemas.js';
import { MAX_BYTES, MAX_IMAGENES } from '../../lib/imagenes/procesar.js';
import { type ArchivoSubido, ImagenesService } from './imagenes.service.js';

const esquemaOrden = z.coerce.number().int().min(1).max(MAX_IMAGENES);

@Autenticado()
@Controller('publicaciones')
export class ImagenesController {
  constructor(private readonly imagenes: ImagenesService) {}

  // multipart/form-data con el campo "imagenes" (uno o varios archivos).
  // multer (dentro de Nest) corta ANTES de leer todo si un archivo pasa de 5 MB
  // (→ 413) o si llegan más de 5 archivos: así nadie llena la memoria del servidor.
  @Post(':id/imagenes')
  @UseInterceptors(
    FilesInterceptor('imagenes', MAX_IMAGENES, {
      limits: { fileSize: MAX_BYTES, files: MAX_IMAGENES, fields: 0 },
    }),
  )
  subir(
    @Param('id', new ValidacionZod(esquemaIdPublicacion)) id: number,
    @UploadedFiles() archivos: ArchivoSubido[] | undefined,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ) {
    return this.imagenes.subir(id, archivos ?? [], { usuario, ip });
  }

  @Delete(':id/imagenes/:orden')
  borrar(
    @Param('id', new ValidacionZod(esquemaIdPublicacion)) id: number,
    @Param('orden', new ValidacionZod(esquemaOrden)) orden: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ) {
    return this.imagenes.borrar(id, orden, { usuario, ip });
  }
}

// Público: el catálogo muestra las miniaturas a cualquiera.
// Sin rate limit: una página del catálogo pide 20 miniaturas de una vez y el
// límite general (100/min) cortaría a quien hojea varias páginas.
@SkipThrottle()
@Controller('imagenes')
export class ImagenesPublicasController {
  constructor(private readonly imagenes: ImagenesService) {}

  @Get('publicaciones/:id/:archivo')
  async ver(
    @Param('id') id: string,
    @Param('archivo') archivo: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const imagen = await this.imagenes.leer(`publicaciones/${id}/${archivo}`);
    res.set({
      'Content-Type': imagen.tipo,
      // El nombre es un UUID que nunca se reutiliza: el navegador puede guardarla un año.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Que el navegador no "adivine" otro tipo distinto al que decimos.
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(imagen.contenido);
  }
}
