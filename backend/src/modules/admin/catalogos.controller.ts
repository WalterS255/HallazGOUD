import {
  Body,
  Controller,
  Delete,
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
import { UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import { esquemaId } from '../publicaciones/publicaciones.schemas.js';
import { CatalogosService } from './catalogos.service.js';
import { UsuariosAdminService } from './usuarios-admin.service.js';

const texto = (max: number, campo: string) =>
  z
    .string({ error: `Escribe ${campo}` })
    .trim()
    .min(2, { error: `Escribe ${campo}` })
    .max(max, { error: `${campo} es demasiado largo` });

const esquemaCategoria = z.object({
  nombre: texto(60, 'el nombre'),
  icono: z.string().trim().max(60).optional(),
  sensible: z.boolean().optional(),
});
// Al editar, todo es opcional, pero algo hay que cambiar.
const esquemaEditarCategoria = esquemaCategoria
  .partial()
  .extend({ activa: z.boolean().optional() })
  .refine((d) => Object.keys(d).length > 0, { error: 'No enviaste nada para cambiar' });
const esquemaSede = z.object({ nombre: texto(80, 'el nombre') });
const esquemaLugar = z.object({
  id_sede: esquemaId,
  edificio: texto(100, 'el edificio'),
  referencia: z.string().trim().max(200).optional(),
});
const esquemaEditarLugar = esquemaLugar
  .omit({ id_sede: true })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { error: 'No enviaste nada para cambiar' });
const esquemaBuscar = z.object({
  q: z
    .string({ error: 'Escribe un nombre o un correo' })
    .trim()
    .min(2, { error: 'Escribe al menos 2 letras' }),
});
const esquemaCuenta = z.object({
  accion: z.enum(['SUSPENDER', 'REACTIVAR'], { error: 'La acción debe ser SUSPENDER o REACTIVAR' }),
  motivo: z.string().trim().max(300).optional(),
});

// Público (añadido): categorías activas, sedes y lugares para el formulario de publicar.
@Controller('catalogos')
export class CatalogosPublicosController {
  constructor(private readonly catalogos: CatalogosService) {}

  @Get()
  listar() {
    return this.catalogos.publico();
  }
}

// RF-28: catálogos, solo ADMIN.
@Roles('ADMIN')
@Controller('admin')
export class CatalogosAdminController {
  constructor(private readonly catalogos: CatalogosService) {}

  @Get('categorias')
  categorias() {
    return this.catalogos.categorias();
  }

  @Post('categorias')
  crearCategoria(@Body(new ValidacionZod(esquemaCategoria)) d: z.output<typeof esquemaCategoria>) {
    return this.catalogos.crearCategoria(d);
  }

  @Patch('categorias/:id')
  editarCategoria(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaEditarCategoria)) d: z.output<typeof esquemaEditarCategoria>,
  ) {
    return this.catalogos.editarCategoria(id, d);
  }

  @Post('sedes')
  crearSede(@Body(new ValidacionZod(esquemaSede)) d: z.output<typeof esquemaSede>) {
    return this.catalogos.crearSede(d.nombre);
  }

  @Patch('sedes/:id')
  editarSede(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaSede)) d: z.output<typeof esquemaSede>,
  ) {
    return this.catalogos.editarSede(id, d.nombre);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('sedes/:id')
  async borrarSede(@Param('id', new ValidacionZod(esquemaId)) id: number): Promise<void> {
    await this.catalogos.borrarSede(id);
  }

  @Post('lugares')
  crearLugar(@Body(new ValidacionZod(esquemaLugar)) d: z.output<typeof esquemaLugar>) {
    return this.catalogos.crearLugar(d);
  }

  @Patch('lugares/:id')
  editarLugar(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaEditarLugar)) d: z.output<typeof esquemaEditarLugar>,
  ) {
    return this.catalogos.editarLugar(id, d);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('lugares/:id')
  async borrarLugar(@Param('id', new ValidacionZod(esquemaId)) id: number): Promise<void> {
    await this.catalogos.borrarLugar(id);
  }
}

// RF-29: buscar cuentas y suspenderlas o reactivarlas, solo ADMIN.
@Roles('ADMIN')
@Controller('admin/usuarios')
export class UsuariosAdminController {
  constructor(private readonly usuarios: UsuariosAdminService) {}

  @Get()
  buscar(@Query(new ValidacionZod(esquemaBuscar)) q: z.output<typeof esquemaBuscar>) {
    return this.usuarios.buscar(q.q);
  }

  @Patch(':id')
  cambiarEstado(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @Body(new ValidacionZod(esquemaCuenta)) d: z.output<typeof esquemaCuenta>,
    @UsuarioActual() admin: UsuarioSesion,
    @Ip() ip: string,
  ) {
    return this.usuarios.cambiarEstado(id, d.accion, admin.id, d.motivo, ip);
  }
}
