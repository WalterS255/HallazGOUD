import { Global, Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller.js';
import { NotificacionesRepository } from './notificaciones.repository.js';
import { NotificacionesService } from './notificaciones.service.js';

// Global: reclamaciones, mensajes, entrega, moderación y publicaciones avisan con
// NotificacionesService sin importar este módulo (y sin crear importaciones circulares).
@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesRepository, NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
