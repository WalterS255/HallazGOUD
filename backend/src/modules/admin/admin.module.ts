import { Module } from '@nestjs/common';
import { EstadisticasRepository } from './estadisticas.repository.js';
import { EstadisticasService } from './estadisticas.service.js';

// Panel del administrador (RF-26 a RF-30). Por ahora, la capa de datos de las
// estadísticas; el controlador necesita el guard de rol ADMIN de la Fase D.
@Module({
  providers: [EstadisticasRepository, EstadisticasService],
  exports: [EstadisticasService],
})
export class AdminModule {}
