import { Module } from '@nestjs/common';
import { PublicacionesModule } from '../modules/publicaciones/publicaciones.module.js';
import { ExpiracionService } from './expiracion.service.js';

// Tareas programadas (§4: node-cron dentro del backend). Por ahora solo la lógica;
// falta el programador que las dispare cada día.
@Module({
  imports: [PublicacionesModule],
  providers: [ExpiracionService],
  exports: [ExpiracionService],
})
export class JobsModule {}
