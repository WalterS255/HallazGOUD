import { Module } from '@nestjs/common';
import { PublicacionesModule } from '../publicaciones/publicaciones.module.js';
import { ReclamacionesRepository } from './reclamaciones.repository.js';
import { ReclamacionesService } from './reclamaciones.service.js';

// Capa de datos de reclamación y entrega (§6.2, §6.5). El controlador llega con
// los guards de sesión de la Fase D; el chat (mensajes) va aparte.
@Module({
  imports: [PublicacionesModule],
  providers: [ReclamacionesRepository, ReclamacionesService],
  exports: [ReclamacionesService],
})
export class ReclamacionesModule {}
