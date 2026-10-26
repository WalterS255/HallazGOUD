import { Module } from '@nestjs/common';
import { CoincidenciasModule } from '../coincidencias/coincidencias.module.js';
import { CatalogoRepository } from './catalogo.repository.js';
import { CatalogoService } from './catalogo.service.js';
import { PublicacionesController } from './publicaciones.controller.js';
import { PublicacionesRepository } from './publicaciones.repository.js';
import { PublicacionesService } from './publicaciones.service.js';

// Catálogo, detalle y coincidencias del autor (lectura) + máquina de estados.
// Crear, editar y retirar publicaciones (con imágenes) llegan después.
@Module({
  imports: [CoincidenciasModule],
  controllers: [PublicacionesController],
  providers: [PublicacionesRepository, PublicacionesService, CatalogoRepository, CatalogoService],
  exports: [PublicacionesService, CatalogoService],
})
export class PublicacionesModule {}
