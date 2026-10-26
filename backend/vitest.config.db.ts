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
  },
});
