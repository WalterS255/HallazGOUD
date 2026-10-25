import { Module } from '@nestjs/common';
import { SaludModule } from './modules/salud/salud.module.js';

// Módulo raíz: solo importa los módulos de cada funcionalidad.
@Module({
  imports: [SaludModule],
})
export class AppModule {}
