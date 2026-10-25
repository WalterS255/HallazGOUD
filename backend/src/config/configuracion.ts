// Lee las variables de entorno UNA vez y las expone ya convertidas.
// El resto del código importa `config` y nunca toca process.env directamente:
// así, si falta una variable, falla al arrancar y no a mitad de una petición.
// (En la Fase D esto se valida con un esquema de Zod.)

// Node 24 trae su propio lector de .env (no hace falta dotenv). Se hace aquí,
// y no en main.ts, porque los `import` se ejecutan antes que el código de main.ts.
// Si el archivo no existe (producción: las variables las pone Docker), se ignora.
try {
  process.loadEnvFile('../.env');
} catch {
  // sin .env: se usan las variables que ya tenga el proceso
}

function leerPuerto(valor: string | undefined, porDefecto: number): number {
  const puerto = Number(valor ?? porDefecto);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error(`PUERTO inválido: "${valor}". Debe ser un número entre 1 y 65535.`);
  }
  return puerto;
}

export const config = Object.freeze({
  entorno: process.env.NODE_ENV ?? 'development',
  puerto: leerPuerto(process.env.PUERTO, 3000),
});
