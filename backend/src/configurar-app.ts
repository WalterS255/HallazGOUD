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

  // Encabezados de seguridad que pidió OWASP ZAP (Fase J). Sin helmet: son dos líneas.
  // nosniff: el navegador no "adivina" el tipo de una respuesta (un JSON nunca se
  // interpreta como HTML o script).
  app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Solo la propia app puede usar las respuestas (fotos incluidas) desde otro sitio.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  // IP real del usuario para el rate limit (ver comun/limites/limites.ts). Con N saltos,
  // Express toma de X-Forwarded-For la IP que puso el intermediario de confianza más
  // lejano e ignora lo que haya a la izquierda (lo que el propio cliente pudo inventar).
  if (saltosProxy > 0) app.set('trust proxy', saltosProxy);
}
