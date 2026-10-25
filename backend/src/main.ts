// Punto de entrada: crea la app de Nest y la pone a escuchar.
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { config } from './config/configuracion.js';
import { configurarApp } from './configurar-app.js';

async function bootstrap() {
  // bufferLogs: guarda los logs del arranque hasta que pino esté listo,
  // para que TODO salga con el mismo formato.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configurarApp(app);

  // Docker detiene los contenedores con SIGTERM: Nest cierra con calma
  // (termina las peticiones en curso) en lugar de cortar de golpe.
  app.enableShutdownHooks();

  await app.listen(config.puerto);
  logger.log(
    `HallazGO API escuchando en http://localhost:${config.puerto} (${config.entorno})`,
    'Arranque',
  );
}
await bootstrap();
