import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Params } from 'nestjs-pino';
import { config } from '../../config/configuracion.js';

// Configuración de pino (logger) y pino-http (una línea de log por cada petición).
export const opcionesLogger: Params = {
  pinoHttp: {
    level: config.nivelLog,

    // En desarrollo, pino-pretty muestra los logs con colores y en una línea.
    // En producción se escriben en JSON: así los lee una herramienta de monitoreo.
    transport:
      config.entorno === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
        : undefined,

    // Cada petición recibe un id único. Se devuelve en el encabezado X-Request-Id:
    // si un usuario reporta un error, con ese id se encuentra su línea en el log.
    genReqId: (req: IncomingMessage, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },

    // NUNCA escribir secretos en el log: se reemplazan por "[OCULTO]".
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.contrasena',
        '*.token',
      ],
      censor: '[OCULTO]',
    },

    // De cada petición solo se guarda lo útil (no todos los encabezados).
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        metodo: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ estado: res.statusCode }),
    },

    // Nivel según el resultado: 5xx = error, 4xx = advertencia, resto = info.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  },
};
