import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { FiltroErrores } from './comun/errores/filtro-errores.js';
import { opcionesLogger } from './comun/logger/opciones-logger.js';
import { JobsModule } from './jobs/jobs.module.js';
import { AuditoriaModule } from './lib/auditoria/auditoria.module.js';
import { PrismaModule } from './lib/prisma/prisma.module.js';
import { CoincidenciasModule } from './modules/coincidencias/coincidencias.module.js';
import { PublicacionesModule } from './modules/publicaciones/publicaciones.module.js';
import { ReclamacionesModule } from './modules/reclamaciones/reclamaciones.module.js';
import { SaludModule } from './modules/salud/salud.module.js';

// Módulo raíz: importa los módulos de cada funcionalidad y registra lo global.
@Module({
  imports: [
    LoggerModule.forRoot(opcionesLogger),
    // lib/: globales, disponibles para todos los módulos
    PrismaModule,
    AuditoriaModule,
    // modules/: una funcionalidad cada uno
    SaludModule,
    CoincidenciasModule,
    PublicacionesModule,
    ReclamacionesModule,
    // jobs/: tareas programadas
    JobsModule,
  ],
  providers: [
    // Registrado aquí (y no en main.ts) para que las pruebas e2e también lo usen.
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
})
export class AppModule {}
