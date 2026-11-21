// Lee las variables de entorno UNA vez, las valida con Zod y las expone ya convertidas.
// El resto del código importa `config` y nunca toca process.env directamente:
// así, si falta una variable o está mal escrita, el servidor NO arranca, en lugar
// de fallar a mitad de una petición (por ejemplo, al enviar el primer correo).
import { z } from 'zod';

// Node 24 trae su propio lector de .env (no hace falta dotenv). Se hace aquí,
// y no en main.ts, porque los `import` se ejecutan antes que el código de main.ts.
// Si el archivo no existe (producción: las variables las pone Docker), se ignora.
try {
  process.loadEnvFile('../.env');
} catch {
  // sin .env: se usan las variables que ya tenga el proceso
}

// En producción no se aceptan los valores de ejemplo de .env.example.
const esValorDeEjemplo = (valor: string) => /cambia-?est/i.test(valor);

const puertoTcp = z.coerce
  .number({ error: 'debe ser un número' })
  .int({ error: 'debe ser un número entero' })
  .min(1, { error: 'debe estar entre 1 y 65535' })
  .max(65535, { error: 'debe estar entre 1 y 65535' });

const texto = z.string({ error: 'es obligatoria' }).trim().min(1, { error: 'es obligatoria' });

// Describe TODAS las variables que necesita el backend (ver .env.example).
const esquemaEntorno = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PUERTO: puertoTcp.default(3000),
    NIVEL_LOG: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    URL_FRONTEND: z.url({ error: 'debe ser una URL (http://…)' }),
    // Cuántos intermediarios de confianza hay delante del backend (ver comun/limites/limites.ts).
    TRUST_PROXY: z.coerce
      .number({ error: 'debe ser un número' })
      .int({ error: 'debe ser un número entero' })
      .min(0, { error: 'debe estar entre 0 y 5' })
      .max(5, { error: 'debe estar entre 0 y 5' })
      .default(0),
    ZONA_HORARIA: texto.default('America/Bogota'),

    DATABASE_URL: z
      .string({ error: 'es obligatoria' })
      .startsWith('postgresql://', { error: 'debe empezar por postgresql://' }),

    JWT_SECRET: z
      .string({ error: 'es obligatoria' })
      .min(32, { error: 'debe tener al menos 32 caracteres (usa un valor aleatorio)' }),
    JWT_EXPIRA_EN: z
      .string({ error: 'es obligatoria' })
      .regex(/^\d+[smhd]$/, { error: 'debe ser como 15m, 12h o 1d' }),
    BCRYPT_COSTE: z.coerce
      .number({ error: 'debe ser un número' })
      .int({ error: 'debe ser un número entero' })
      .min(10, { error: 'debe ser al menos 10 (RNF-06)' })
      .max(15, { error: 'más de 15 hace el login demasiado lento' }),

    DOMINIO_CORREO: texto,

    SMTP_HOST: texto,
    SMTP_PORT: puertoTcp,
    SMTP_FROM: texto,

    S3_ENDPOINT: z.url({ error: 'debe ser una URL (http://…)' }),
    S3_REGION: texto.default('us-east-1'),
    S3_BUCKET: texto,
    S3_ACCESS_KEY: texto,
    S3_SECRET_KEY: texto,
  })
  // Reglas que miran varias variables a la vez: solo aplican en producción.
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== 'production') return;
    for (const nombre of ['JWT_SECRET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
      if (esValorDeEjemplo(v[nombre])) {
        ctx.addIssue({
          code: 'custom',
          path: [nombre],
          message: 'todavía tiene el valor de ejemplo de .env.example',
        });
      }
    }
  });

// Convierte los nombres del .env (MAYÚSCULAS) en un objeto ordenado para el código.
function aConfig(v: z.infer<typeof esquemaEntorno>) {
  return Object.freeze({
    entorno: v.NODE_ENV,
    puerto: v.PUERTO,
    // En las pruebas no se escribe nada al log, para que la salida de Vitest se lea limpia.
    nivelLog: v.NIVEL_LOG ?? (v.NODE_ENV === 'test' ? 'silent' : 'info'),
    urlFrontend: v.URL_FRONTEND,
    saltosProxy: v.TRUST_PROXY,
    zonaHoraria: v.ZONA_HORARIA,
    baseDatos: { url: v.DATABASE_URL },
    jwt: { secreto: v.JWT_SECRET, expiraEn: v.JWT_EXPIRA_EN },
    bcryptCoste: v.BCRYPT_COSTE,
    dominioCorreo: v.DOMINIO_CORREO.toLowerCase(),
    smtp: { host: v.SMTP_HOST, puerto: v.SMTP_PORT, remitente: v.SMTP_FROM },
    s3: {
      endpoint: v.S3_ENDPOINT,
      region: v.S3_REGION,
      bucket: v.S3_BUCKET,
      llaveAcceso: v.S3_ACCESS_KEY,
      llaveSecreta: v.S3_SECRET_KEY,
    },
  });
}

export type Config = ReturnType<typeof aConfig>;

// Función pura: recibe las variables y devuelve la config, o lanza un error que
// lista TODOS los problemas a la vez (no solo el primero). Las pruebas la usan
// con variables inventadas, sin tocar el .env real.
export function cargarConfig(variables: Record<string, string | undefined>): Config {
  const resultado = esquemaEntorno.safeParse(variables);
  if (!resultado.success) {
    const lista = resultado.error.issues
      .map((p) => `  - ${p.path.join('.')}: ${p.message}`)
      .join('\n');
    throw new Error(`Configuración inválida en el .env:\n${lista}`);
  }
  return aConfig(resultado.data);
}

export const config = cargarConfig(process.env);
