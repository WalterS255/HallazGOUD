import { Module } from '@nestjs/common';
import { CatalogoRepository } from './catalogo.repository.js';
import { CatalogoService } from './catalogo.service.js';
import { GestionController } from './gestion.controller.js';
import { GestionRepository } from './gestion.repository.js';
import { GestionService } from './gestion.service.js';
import { PublicacionesRepository } from './publicaciones.repository.js';
import { PublicacionesService } from './publicaciones.service.js';

// Por ahora la capa de datos: máquina de estados y catálogo. Los controladores
// llegan con el Pipe de Zod y los guards de sesión de la Fase D.
@Module({
  // Crear, editar y retirar (gestion.*). Los de lectura (catálogo) van aparte.
  controllers: [GestionController],
  providers: [
    PublicacionesRepository,
    PublicacionesService,
    CatalogoRepository,
    CatalogoService,
    GestionRepository,
    GestionService,
  ],
  exports: [PublicacionesService, CatalogoService],
})
export class PublicacionesModule {}
