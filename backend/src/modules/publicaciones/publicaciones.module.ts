import { Module } from '@nestjs/common';
import { CoincidenciasModule } from '../coincidencias/coincidencias.module.js';
import { CatalogoRepository } from './catalogo.repository.js';
import { CatalogoService } from './catalogo.service.js';
import { GestionController } from './gestion.controller.js';
import { GestionRepository } from './gestion.repository.js';
import { GestionService } from './gestion.service.js';
import { ImagenesController, ImagenesPublicasController } from './imagenes.controller.js';
import { ImagenesRepository } from './imagenes.repository.js';
import { ImagenesService } from './imagenes.service.js';
import { PublicacionesController } from './publicaciones.controller.js';
import { PublicacionesRepository } from './publicaciones.repository.js';
import { PublicacionesService } from './publicaciones.service.js';

// Lectura: catálogo, detalle y coincidencias del autor (PublicacionesController).
// Escritura: crear, editar y retirar (GestionController, gestion.*).
// Imágenes: subir y quitar (ImagenesController) y servirlas al público
// (ImagenesPublicasController, en /api/imagenes/…).
// Varios controladores comparten el prefijo /publicaciones; Nest lo permite.
// Por debajo: la máquina de estados (PublicacionesService) es el único camino para
// cambiar el estado, y PublicacionesRepository el único que escribe historial_estado.
@Module({
  imports: [CoincidenciasModule],
  controllers: [
    PublicacionesController,
    GestionController,
    ImagenesController,
    ImagenesPublicasController,
  ],
  providers: [
    PublicacionesRepository,
    PublicacionesService,
    CatalogoRepository,
    CatalogoService,
    GestionRepository,
    GestionService,
    ImagenesRepository,
    ImagenesService,
  ],
  exports: [PublicacionesService, CatalogoService],
})
export class PublicacionesModule {}
