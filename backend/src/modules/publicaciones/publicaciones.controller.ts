import { Controller, Get, Param, Query } from '@nestjs/common';
import type { UsuarioSesion } from '../../comun/autorizacion/roles.js';
import { Autenticado, UsuarioActual } from '../../comun/autorizacion/sesion.guard.js';
import { ValidacionZod } from '../../comun/validacion/validacion-zod.pipe.js';
import { CoincidenciasService } from '../coincidencias/coincidencias.service.js';
import { CatalogoService } from './catalogo.service.js';
import {
  esquemaFiltrosCatalogo,
  esquemaId,
  type FiltrosCatalogoHttp,
} from './publicaciones.schemas.js';

// Controladores "finos": validan con Zod y llaman al servicio. Las reglas viven
// en los servicios. Crear, editar y retirar publicaciones llegan después.
@Controller('publicaciones')
export class PublicacionesController {
  constructor(
    private readonly catalogo: CatalogoService,
    private readonly coincidencias: CoincidenciasService,
  ) {}

  // Público (RF-13 a RF-16). Lo que ve un visitante está pendiente (pregunta 13.5).
  @Get()
  listar(@Query(new ValidacionZod(esquemaFiltrosCatalogo)) filtros: FiltrosCatalogoHttp) {
    return this.catalogo.listar(filtros);
  }

  // Público (RF-17): sin detalle reservado ni datos de contacto.
  @Get(':id')
  detalle(@Param('id', new ValidacionZod(esquemaId)) id: number) {
    return this.catalogo.detalle(id);
  }

  // Solo el autor (RF-23).
  @Autenticado()
  @Get(':id/coincidencias')
  coincidenciasDe(
    @Param('id', new ValidacionZod(esquemaId)) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.coincidencias.sugerenciasParaAutor(id, usuario.id);
  }
}
