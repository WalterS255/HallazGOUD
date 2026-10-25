import { Module } from '@nestjs/common';
import { CatalogoRepository } from './catalogo.repository.js';
import { CatalogoService } from './catalogo.service.js';
import { PublicacionesRepository } from './publicaciones.repository.js';
import { PublicacionesService } from './publicaciones.service.js';

// Por ahora la capa de datos: máquina de estados y catálogo. Los controladores
// llegan con el Pipe de Zod y los guards de sesión de la Fase D.
@Module({
  providers: [PublicacionesRepository, PublicacionesService, CatalogoRepository, CatalogoService],
  exports: [PublicacionesService, CatalogoService],
})
export class PublicacionesModule {}
