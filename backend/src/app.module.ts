import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { FiltroErrores } from './comun/errores/filtro-errores.js';
import { opcionesLogger } from './comun/logger/opciones-logger.js';
import { PrismaModule } from './lib/prisma/prisma.module.js';
import { SaludModule } from './modules/salud/salud.module.js';

// Módulo raíz: importa los módulos de cada funcionalidad y registra lo global.
@Module({
  imports: [LoggerModule.forRoot(opcionesLogger), PrismaModule, SaludModule],
  providers: [
    // Registrado aquí (y no en main.ts) para que las pruebas e2e también lo usen.
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
})
export class AppModule {}
