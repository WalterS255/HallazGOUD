import { defineConfig } from 'vitest/config';

// Pruebas de integración contra PostgreSQL real (base `hallazgo_test`).
// Necesitan `docker compose up -d`. Se ejecutan con `npm run test:db`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.db-spec.ts'],
    globalSetup: ['test/db/preparar-bd-test.ts'],
    // Un archivo a la vez: todos comparten la misma base de datos.
    fileParallelism: false,
    // 15 s (el normal es 5): la primera prueba de cada archivo abre la conexión y,
    // en un PC lento, eso solo ya rozaba los 5 s y fallaba de vez en cuando.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
