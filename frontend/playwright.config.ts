import { defineConfig, devices } from '@playwright/test';

// Pruebas de punta a punta en un navegador real (Fase J). Recorren la app como lo haría
// una persona: con el frontend, el backend, PostgreSQL, SeaweedFS y Mailpit de verdad.
// Requisitos: `docker compose up -d` y `npm run db:seed` en backend/.
//
// La contraseña de los usuarios de prueba viene del .env de la raíz (CONTRASENA_SEED),
// nunca del código (regla 5 de CLAUDE.md).
try {
  process.loadEnvFile('../.env');
} catch {
  // Sin .env (por ejemplo en el CI): las variables deben venir del entorno.
}

// E2E_URL: correr las pruebas contra otro sitio, por ejemplo el stack de producción local
// (https://localhost:8443, con certificado de prueba). Sin ella: los servidores de desarrollo.
const destino = process.env.E2E_URL;

export default defineConfig({
  testDir: './e2e',
  // Un archivo a la vez: el login tiene un límite de 5 intentos por minuto y varias
  // pruebas en paralelo lo agotarían. Además comparten los mismos usuarios de prueba.
  workers: 1,
  fullyParallel: false,
  // En desarrollo, Next compila cada pantalla la primera vez que alguien la visita.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: destino ?? 'http://localhost:3001',
    ignoreHTTPSErrors: !!destino, // el certificado local de Caddy no es de una autoridad pública
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure', // si algo falla, queda la grabación paso a paso
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inicia sesión una vez por usuario y la guarda (e2e/sesiones.setup.ts).
    { name: 'sesiones', testMatch: 'sesiones.setup.ts' },
    {
      // Mobile first (RNF-04): la pantalla de un celular pequeño, 360 px de ancho.
      name: 'celular',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 780 },
        isMobile: false,
      },
      dependencies: ['sesiones'],
    },
  ],
  // Si el backend y el frontend ya están encendidos, los usa; si no, los arranca.
  webServer: destino
    ? undefined
    : [
        {
          command: 'npm --prefix ../backend run start:dev',
          url: 'http://localhost:3000/api/salud',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'npm run dev',
          url: 'http://localhost:3001',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
