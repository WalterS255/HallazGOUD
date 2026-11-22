// Qué revisa husky antes de cada commit, para los archivos del frontend.
// Los comandos usan los programas de frontend/node_modules (npm --prefix frontend exec).
// Las rutas de la configuración son absolutas, calculadas desde este archivo: así no importa
// en qué carpeta se ejecute cada comando. lint-staged pasa los archivos con ruta absoluta.
// Es .mjs porque el package.json del frontend no declara "type": "module".
import { fileURLToPath } from 'node:url';

const ruta = (archivo) => `"${fileURLToPath(new URL(archivo, import.meta.url))}"`;
const enFrontend = 'npm --prefix frontend exec --';
const comillas = (archivos) => archivos.map((a) => `"${a}"`).join(' ');
const prettier = `${enFrontend} prettier --write --ignore-path ${ruta('./.prettierignore')}`;
const oxlint = `${enFrontend} oxlint -c ${ruta('./.oxlintrc.json')} --deny-warnings`;

export default {
  '*.{ts,tsx,mjs}': (archivos) => [
    // 1) Formatea (y vuelve a agregar al commit el archivo ya formateado).
    `${prettier} ${comillas(archivos)}`,
    // 2) Lint (React, Next.js y accesibilidad). Cualquier advertencia bloquea el commit.
    `${oxlint} ${comillas(archivos)}`,
  ],
  '*.{css,json,md}': (archivos) => `${prettier} ${comillas(archivos)}`,
};
