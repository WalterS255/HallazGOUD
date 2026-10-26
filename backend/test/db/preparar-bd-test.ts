// "globalSetup" de Vitest: se ejecuta UNA vez antes de todas las pruebas de BD.
// Crea una base de pruebas NUEVA para esta corrida, le aplica las migraciones y la
// borra al terminar. Nunca toca `hallazgo_ud` (la de desarrollo).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

// Una base de pruebas POR CORRIDA: hallazgo_test_<carpeta>_<pid>. Si dos corridas usan
// la MISMA base, el DROP DATABASE de una borra la de la otra a mitad de sus pruebas
// (pasó dos veces: "la tabla usuario no existe"). Primero se separó por carpeta, pero
// dos sesiones verificando main en la misma carpeta volvieron a chocar: por eso el pid.
export function nombreBdTest(pid = process.pid): string {
  const carpeta = path.basename(path.resolve(import.meta.dirname, '../../..'));
  const sufijo = carpeta
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  // 63 = largo máximo de un nombre en Postgres; el pid va al final para que no se corte.
  return `hallazgo_test_${sufijo.slice(0, 40)}_${pid}`;
}
const BD_TEST = nombreBdTest();

// Por seguridad: el cliente de las pruebas solo acepta conectarse a una base de pruebas.
export function esUrlDePruebas(url: string): boolean {
  return /^\/hallazgo_test_[a-z0-9_]+$/.test(new URL(url).pathname);
}

export function urlDe(url: string, baseDatos: string): string {
  const u = new URL(url);
  u.pathname = `/${baseDatos}`;
  return u.toString();
}

export default async function prepararBdTest(): Promise<() => Promise<void>> {
  try {
    process.loadEnvFile('../.env');
  } catch {
    // en CI las variables llegan por el entorno
  }
  const urlDev = process.env.DATABASE_URL;
  if (!urlDev) throw new Error('Falta DATABASE_URL para derivar la URL de la BD de pruebas.');
  const urlTest = urlDe(urlDev, BD_TEST);

  // Para crear o borrar una base hay que estar conectado a OTRA (aquí, a `postgres`).
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlDe(urlDev, 'postgres') }),
  });
  try {
    // WITH (FORCE) cierra conexiones que hayan quedado abiertas de una corrida anterior.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${BD_TEST} WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${BD_TEST}`);
  } finally {
    await admin.$disconnect();
  }

  // `migrate deploy` aplica las migraciones tal cual (sin preguntas ni cambios al schema):
  // es el mismo comando que se usará en producción.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    // Las DOS variables: si DATABASE_URL_MIGRACIONES existiera y apuntara a hallazgo_ud,
    // prisma.config.ts la preferiría y las migraciones de prueba caerían en la base real.
    env: { ...process.env, DATABASE_URL: urlTest, DATABASE_URL_MIGRACIONES: urlTest },
    stdio: 'pipe',
    shell: true,
  });

  // Las pruebas (y la app que levantan) leen esta variable: los procesos de cada
  // archivo de prueba nacen después de este setup y la heredan.
  process.env.DATABASE_URL = urlTest;

  // Lo que devuelve un globalSetup, Vitest lo ejecuta al final ("teardown").
  return async () => {
    const limpieza = new PrismaClient({
      adapter: new PrismaPg({ connectionString: urlDe(urlDev, 'postgres') }),
    });
    try {
      await limpieza.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${BD_TEST} WITH (FORCE)`);
    } finally {
      await limpieza.$disconnect();
    }
  };
}
