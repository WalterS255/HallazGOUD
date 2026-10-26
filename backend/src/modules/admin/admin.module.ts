import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { EstadisticasRepository } from './estadisticas.repository.js';
import { EstadisticasService } from './estadisticas.service.js';

// Panel del administrador (RF-26 a RF-30). Por ahora, solo las estadísticas.
@Module({
  controllers: [AdminController],
  providers: [EstadisticasRepository, EstadisticasService],
  exports: [EstadisticasService],
})
export class AdminModule {}
