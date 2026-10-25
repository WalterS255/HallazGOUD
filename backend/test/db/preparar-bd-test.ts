// "globalSetup" de Vitest: se ejecuta UNA vez antes de todas las pruebas de BD.
// Borra y recrea la base `hallazgo_test` y le aplica las migraciones, para que
// cada corrida empiece desde cero. Nunca toca `hallazgo_ud` (la de desarrollo).
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const BD_TEST = 'hallazgo_test';

export function urlDe(url: string, baseDatos: string): string {
  const u = new URL(url);
  u.pathname = `/${baseDatos}`;
  return u.toString();
}

export default async function prepararBdTest(): Promise<void> {
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

  // Las pruebas leen esta variable para conectarse a la BD de pruebas.
  process.env.DATABASE_URL = urlTest;
}
