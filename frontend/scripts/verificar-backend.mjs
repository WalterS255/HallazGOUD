// Se ejecuta antes de `npm run dev`: comprueba que el backend responda. No detiene el arranque.
import { existsSync, readFileSync } from 'node:fs';

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const amarillo = (t) => `\x1b[33m${t}\x1b[0m`;

const env = existsSync('.env')
  ? Object.fromEntries(
      readFileSync('.env', 'utf8')
        .replace(/^﻿/, '')
        .split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    )
  : {};
if (!existsSync('.env'))
  console.log(
    amarillo('! No existe frontend/.env: se usa http://localhost:3000 (cp .env.example .env)'),
  );

const base = (env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const prefijo = (env.BACKEND_API_PREFIX || '/api').replace(/\/$/, '');

try {
  const r = await fetch(`${base}${prefijo}/salud/bd`, { signal: AbortSignal.timeout(5000) });
  if (r.ok) console.log(verde(`✓ Backend y base de datos responden en ${base}${prefijo}`));
  else
    console.log(
      amarillo(
        `! El backend respondió ${r.status} en ${prefijo}/salud/bd: ¿está encendida la base de datos (docker compose up -d)?`,
      ),
    );
} catch {
  console.log(rojo(`✕ No hay conexión con el backend en ${base}.`));
  console.log(amarillo('  Arráncalo en otra terminal:  cd backend && npm run start:dev\n'));
}
