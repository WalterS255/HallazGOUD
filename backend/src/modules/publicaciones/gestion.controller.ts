import { Body, Controller, Delete, Ip, Param, Post, Put } from '@nestjs/common';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import {
  type DatosCrear,
  type DatosEditar,
  esquemaCrear,
  esquemaEditar,
  esquemaIdPublicacion,
} from './gestion.schemas.js';
import { GestionService } from './gestion.service.js';

// Crear, editar y retirar publicaciones. Las rutas de LECTURA (GET /publicaciones,
// GET /publicaciones/:id) están en el controlador del catálogo: Nest permite varios
// controladores con el mismo prefijo.
@Autenticado() // todas estas rutas exigen sesión
@Controller('publicaciones')
export class GestionController {
  constructor(private readonly gestion: GestionService) {}

  @Post()
  crear(
    @Body(new ValidacionZod(esquemaCrear)) datos: DatosCrear,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ) {
    return this.gestion.crear(datos, { usuario, ip });
  }

  @Put(':id')
  editar(
    @Param('id', new ValidacionZod(esquemaIdPublicacion)) id: number,
    @Body(new ValidacionZod(esquemaEditar)) datos: DatosEditar,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ) {
    return this.gestion.editar(id, datos, { usuario, ip });
  }

  @Delete(':id')
  retirar(
    @Param('id', new ValidacionZod(esquemaIdPublicacion)) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Ip() ip: string,
  ) {
    return this.gestion.retirar(id, { usuario, ip });
  }
}
