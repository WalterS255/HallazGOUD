import type { NestExpressApplication } from '@nestjs/platform-express';
import { config } from './config/configuracion.js';

// Ajustes globales de la app. Viven aquí (y no dentro de main.ts) para que
// las pruebas e2e los apliquen igual: si no, probaríamos una app distinta a la real.
export function configurarApp(
  app: NestExpressApplication,
  saltosProxy: number = config.saltosProxy,
): void {
  // Todas las rutas empiezan por /api (sección 8).
  app.setGlobalPrefix('api');

  // No anunciar "X-Powered-By: Express": no le regalamos pistas a un atacante.
  app.disable('x-powered-by');

  // IP real del usuario para el rate limit (ver comun/limites/limites.ts). Con N saltos,
  // Express toma de X-Forwarded-For la IP que puso el intermediario de confianza más
  // lejano e ignora lo que haya a la izquierda (lo que el propio cliente pudo inventar).
  if (saltosProxy > 0) app.set('trust proxy', saltosProxy);
}
