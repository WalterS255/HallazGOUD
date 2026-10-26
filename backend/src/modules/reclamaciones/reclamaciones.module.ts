import { Module } from '@nestjs/common';
import { PublicacionesModule } from '../publicaciones/publicaciones.module.js';
import { MensajesRepository } from './mensajes.repository.js';
import { MensajesService } from './mensajes.service.js';
import { ReclamacionesController } from './reclamaciones.controller.js';
import { ReclamacionesRepository } from './reclamaciones.repository.js';
import { ReclamacionesService } from './reclamaciones.service.js';

// Reclamación, entrega y chat (§6.2, §6.4, §6.5), con sus rutas HTTP.
@Module({
  imports: [PublicacionesModule],
  controllers: [ReclamacionesController],
  providers: [ReclamacionesRepository, ReclamacionesService, MensajesRepository, MensajesService],
  exports: [ReclamacionesService, MensajesService],
})
export class ReclamacionesModule {}
