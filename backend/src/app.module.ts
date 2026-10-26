import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { RolesGuard } from './comun/autorizacion/roles.js';
import { SesionGuard } from './comun/autorizacion/sesion.guard.js';
import { FiltroErrores } from './comun/errores/filtro-errores.js';
import { opcionesLimites } from './comun/limites/limites.js';
import { opcionesLogger } from './comun/logger/opciones-logger.js';
import { JobsModule } from './jobs/jobs.module.js';
import { AlmacenamientoModule } from './lib/almacenamiento/almacenamiento.module.js';
import { AuditoriaModule } from './lib/auditoria/auditoria.module.js';
import { CorreoModule } from './lib/correo/correo.module.js';
import { PrismaModule } from './lib/prisma/prisma.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CoincidenciasModule } from './modules/coincidencias/coincidencias.module.js';
import { PublicacionesModule } from './modules/publicaciones/publicaciones.module.js';
import { ReclamacionesModule } from './modules/reclamaciones/reclamaciones.module.js';
import { SaludModule } from './modules/salud/salud.module.js';

// Módulo raíz: importa los módulos de cada funcionalidad y registra lo global.
@Module({
  imports: [
    LoggerModule.forRoot(opcionesLogger),
    ThrottlerModule.forRoot(opcionesLimites),
    // lib/: globales, disponibles para todos los módulos
    PrismaModule,
    AuditoriaModule,
    CorreoModule,
    AlmacenamientoModule,
    // modules/: una funcionalidad cada uno
    SaludModule,
    AuthModule,
    CoincidenciasModule,
    PublicacionesModule,
    ReclamacionesModule,
    AdminModule,
    // jobs/: tareas programadas
    JobsModule,
  ],
  providers: [
    // Registrados aquí (y no en main.ts) para que las pruebas e2e también los usen.
    { provide: APP_FILTER, useClass: FiltroErrores },
    // Los *guards* deciden si una petición llega al controlador. Los globales se
    // ejecutan EN ESTE ORDEN, y el orden importa:
    //   1) rate limit (antes que nada: frena a quien inunda, aunque no tenga sesión)
    //   2) sesión (lee el JWT y deja req.usuario)
    //   3) roles (necesita req.usuario: por eso va después de sesión)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SesionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
