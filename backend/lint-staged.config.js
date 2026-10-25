// Qué revisa husky antes de cada commit, para los archivos del backend.
// lint-staged ejecuta los comandos desde la RAÍZ del repositorio, no desde backend/.
// Por eso cada comando le dice a npm explícitamente que use backend/
// (sus programas en node_modules y su .oxlintrc.json).
// Se usa una función porque así recibimos la lista de archivos y armamos el comando nosotros.

const enBackend = 'npm --prefix backend exec --';
const comillas = (archivos) => archivos.map((a) => `"${a}"`).join(' ');

export default {
  '*.ts': (archivos) => [
    // 1) Formatea (y vuelve a agregar al commit el archivo ya formateado).
    `${enBackend} prettier --write ${comillas(archivos)}`,
    // 2) Lint rápido (sin revisar tipos). Cualquier advertencia bloquea el commit.
    //    El lint completo con tipos es `npm run lint` (y en la Fase K, el CI).
    `${enBackend} oxlint -c backend/.oxlintrc.json --deny-warnings ${comillas(archivos)}`,
  ],
};
