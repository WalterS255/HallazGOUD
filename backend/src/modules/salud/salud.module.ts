import { Module } from '@nestjs/common';
import { SaludController } from './salud.controller.js';
import { SaludService } from './salud.service.js';

// Un módulo agrupa todo lo de una funcionalidad (controladores, servicios…).
// Cada módulo de la sección 10 (auth, publicaciones…) tendrá el suyo.
@Module({
  controllers: [SaludController],
  providers: [SaludService],
})
export class SaludModule {}
