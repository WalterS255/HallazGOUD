// Qué revisa husky antes de cada commit, para los archivos del backend.
// Cada comando le dice a npm que use backend/ (sus programas en node_modules).
// La ruta del .oxlintrc.json es absoluta, calculada desde este archivo: lint-staged ejecuta los
// comandos dentro de backend/ (la carpeta de esta configuración), así que la ruta relativa
// "backend/.oxlintrc.json" apuntaba a backend/backend/ y el commit fallaba.
// Se usa una función porque así recibimos la lista de archivos y armamos el comando nosotros.
import { fileURLToPath } from 'node:url';

const enBackend = 'npm --prefix backend exec --';
const comillas = (archivos) => archivos.map((a) => `"${a}"`).join(' ');
const configOxlint = fileURLToPath(new URL('./.oxlintrc.json', import.meta.url));

export default {
  '*.ts': (archivos) => [
    // 1) Formatea (y vuelve a agregar al commit el archivo ya formateado).
    `${enBackend} prettier --write ${comillas(archivos)}`,
    // 2) Lint rápido (sin revisar tipos). Cualquier advertencia bloquea el commit.
    //    El lint completo con tipos es `npm run lint` (y en la Fase K, el CI).
    `${enBackend} oxlint -c "${configOxlint}" --deny-warnings ${comillas(archivos)}`,
  ],
};
