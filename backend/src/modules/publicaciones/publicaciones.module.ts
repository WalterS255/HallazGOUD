import { Module } from '@nestjs/common';
import { PublicacionesRepository } from './publicaciones.repository.js';
import { PublicacionesService } from './publicaciones.service.js';

// Por ahora solo la capa de datos y la máquina de estados. El controlador
// (CRUD de §8) llega cuando existan los guards de sesión de la Fase D.
@Module({
  providers: [PublicacionesRepository, PublicacionesService],
  exports: [PublicacionesService],
})
export class PublicacionesModule {}
