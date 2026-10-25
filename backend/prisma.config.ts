// Configuración de la CLI de Prisma (prisma migrate, prisma studio, prisma db seed…).
// Desde Prisma 7 la URL de la base de datos vive aquí y no en schema.prisma,
// y Prisma ya NO lee el .env por su cuenta: lo cargamos nosotros.
import { defineConfig, env } from 'prisma/config';

try {
  process.loadEnvFile('../.env');
} catch {
  // sin .env (producción): las variables ya las pone Docker
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Node 24 ejecuta TypeScript directamente (quita los tipos al vuelo): no hace falta tsx.
    seed: 'node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
