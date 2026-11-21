import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // RNF-14: cobertura ≥ 60 % en los *.service.ts de los módulos, con pruebas UNITARIAS.
    // `include` hace que también cuenten (en 0 %) los servicios que ninguna prueba carga:
    // sin él, un servicio sin pruebas simplemente no aparecía y el promedio mentía.
    // `npm run test:cov` FALLA si algún número baja del 60 %.
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.service.ts'],
      thresholds: { lines: 60, statements: 60, functions: 60, branches: 60 },
    },
  },
});
