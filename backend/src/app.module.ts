import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { FiltroErrores } from './comun/errores/filtro-errores.js';
import { opcionesLimites } from './comun/limites/limites.js';
import { opcionesLogger } from './comun/logger/opciones-logger.js';
import { SaludModule } from './modules/salud/salud.module.js';

// Módulo raíz: importa los módulos de cada funcionalidad y registra lo global.
@Module({
  imports: [
    LoggerModule.forRoot(opcionesLogger),
    ThrottlerModule.forRoot(opcionesLimites),
    SaludModule,
  ],
  providers: [
    // Registrados aquí (y no en main.ts) para que las pruebas e2e también los usen.
    { provide: APP_FILTER, useClass: FiltroErrores },
    // Un *guard* decide si una petición puede pasar al controlador. Este aplica
    // el rate limit a TODAS las rutas (salvo las marcadas con @SkipThrottle()).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
