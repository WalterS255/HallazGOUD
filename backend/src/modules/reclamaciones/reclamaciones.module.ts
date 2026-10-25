import { Module } from '@nestjs/common';
import { PublicacionesModule } from '../publicaciones/publicaciones.module.js';
import { MensajesRepository } from './mensajes.repository.js';
import { MensajesService } from './mensajes.service.js';
import { ReclamacionesRepository } from './reclamaciones.repository.js';
import { ReclamacionesService } from './reclamaciones.service.js';

// Capa de datos de reclamación, entrega y chat (§6.2, §6.4, §6.5). Los
// controladores llegan con los guards de sesión de la Fase D.
@Module({
  imports: [PublicacionesModule],
  providers: [ReclamacionesRepository, ReclamacionesService, MensajesRepository, MensajesService],
  exports: [ReclamacionesService, MensajesService],
})
export class ReclamacionesModule {}
