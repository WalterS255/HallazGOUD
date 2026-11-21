import { Module } from '@nestjs/common';
import { PublicacionesModule } from '../modules/publicaciones/publicaciones.module.js';
import { ExpiracionService } from './expiracion.service.js';
import { ProgramadorService } from './programador.service.js';

// Tareas programadas (§4: node-cron dentro del backend). ProgramadorService es el
// reloj que dispara cada día la expiración a 90 días (RF-12).
@Module({
  imports: [PublicacionesModule],
  providers: [ExpiracionService, ProgramadorService],
  exports: [ExpiracionService],
})
export class JobsModule {}
