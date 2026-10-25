import type { NestExpressApplication } from '@nestjs/platform-express';

// Ajustes globales de la app. Viven aquí (y no dentro de main.ts) para que
// las pruebas e2e los apliquen igual: si no, probaríamos una app distinta a la real.
export function configurarApp(app: NestExpressApplication): void {
  // Todas las rutas empiezan por /api (sección 8).
  app.setGlobalPrefix('api');

  // No anunciar "X-Powered-By: Express": no le regalamos pistas a un atacante.
  app.disable('x-powered-by');
}
