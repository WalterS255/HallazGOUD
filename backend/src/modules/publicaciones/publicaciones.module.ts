import { Module } from '@nestjs/common';
import { CoincidenciasModule } from '../coincidencias/coincidencias.module.js';
import { CatalogoRepository } from './catalogo.repository.js';
import { CatalogoService } from './catalogo.service.js';
import { GestionController } from './gestion.controller.js';
import { GestionRepository } from './gestion.repository.js';
import { GestionService } from './gestion.service.js';
import { PublicacionesController } from './publicaciones.controller.js';
import { PublicacionesRepository } from './publicaciones.repository.js';
import { PublicacionesService } from './publicaciones.service.js';

// Lectura: catálogo, detalle y coincidencias del autor (PublicacionesController).
// Escritura: crear, editar y retirar (GestionController, gestion.*).
// Los dos controladores comparten el prefijo /publicaciones; Nest lo permite.
// Por debajo: la máquina de estados (PublicacionesService) es el único camino para
// cambiar el estado, y PublicacionesRepository el único que escribe historial_estado.
@Module({
  imports: [CoincidenciasModule],
  controllers: [PublicacionesController, GestionController],
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
