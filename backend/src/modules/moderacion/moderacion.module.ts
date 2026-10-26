import { Module } from '@nestjs/common';
import { ModeracionController, ReportesController } from './moderacion.controller.js';
import { ModeracionRepository } from './moderacion.repository.js';
import { ModeracionService } from './moderacion.service.js';

// Reportes (RF-26) y moderación (RF-27). Ocultar una publicación la saca del catálogo
// y del detalle (los dos filtran `oculta`); retirarla del todo sigue siendo
// DELETE /publicaciones/:id, que ya admite moderadores.
@Module({
  controllers: [ReportesController, ModeracionController],
  providers: [ModeracionRepository, ModeracionService],
})
export class ModeracionModule {}
