// Esquemas de Zod de lo que el usuario envía a /api/auth/*.
// Se aplican con el Pipe:  @Body(new ValidacionZod(esquemaRegistro)) datos: DatosRegistro
// Validan FORMA (que el correo sea del dominio, que la contraseña tenga 8 caracteres…).
// Las reglas que necesitan la BD (¿el correo ya existe?) van en auth.service.ts.
import { z } from 'zod';
import { config } from '../../config/configuracion.js';

// bcrypt solo usa los primeros 72 BYTES de la contraseña e ignora el resto: dos
// contraseñas que empiezan igual y difieren después del byte 72 serían "la misma".
// Se cuentan bytes y no letras porque una tilde o una ñ ocupan 2 bytes en UTF-8.
const MAX_BYTES_BCRYPT = 72;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

const correoInstitucional = z
  .string({ error: 'Escribe tu correo' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Escribe un correo válido' })
      .refine((c) => c.endsWith(`@${config.dominioCorreo}`), {
        error: `Usa tu correo institucional @${config.dominioCorreo}`,
      }),
  );

// Contraseña NUEVA (registro y restablecer): aquí sí se exige la política.
const contrasenaNueva = z
  .string({ error: 'Escribe una contraseña' })
  .min(8, { error: 'La contraseña debe tener al menos 8 caracteres' })
  .refine((c) => bytes(c) <= MAX_BYTES_BCRYPT, { error: 'La contraseña es demasiado larga' })
  .refine((c) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c) && /\d/.test(c), {
    error: 'La contraseña debe tener al menos una letra y un número',
  });

// Al iniciar sesión NO se revisa la política (solo que no esté vacía ni sea absurda):
// si cambia la política, las cuentas viejas deben poder seguir entrando.
const contrasenaActual = z
  .string({ error: 'Escribe tu contraseña' })
  .min(1, { error: 'Escribe tu contraseña' })
  .refine((c) => bytes(c) <= MAX_BYTES_BCRYPT, { error: 'La contraseña es demasiado larga' });

export const esquemaRegistro = z.object({
  nombre: z
    .string({ error: 'Escribe tu nombre' })
    .trim()
    .min(2, { error: 'Escribe tu nombre' })
    .max(120, { error: 'El nombre es demasiado largo' }),
  correo: correoInstitucional,
  programa: z
    .string({ error: 'Escribe tu programa o dependencia' })
    .trim()
    .min(2, { error: 'Escribe tu programa o dependencia' })
    .max(160, { error: 'El programa es demasiado largo' }),
  contrasena: contrasenaNueva,
  // Ley 1581 (RNF-19): sin aceptar la política de datos no hay registro.
  aceptaPolitica: z.literal(true, {
    error: 'Debes aceptar la política de tratamiento de datos',
  }),
});

export const esquemaLogin = z.object({
  correo: z.string({ error: 'Escribe tu correo' }).trim().toLowerCase().min(1, {
    error: 'Escribe tu correo',
  }),
  contrasena: contrasenaActual,
});

export const esquemaRecuperar = z.object({
  correo: z.string({ error: 'Escribe tu correo' }).trim().toLowerCase().min(1, {
    error: 'Escribe tu correo',
  }),
});

export const esquemaRestablecer = z.object({
  // Los tokens son 32 bytes aleatorios en hexadecimal = 64 caracteres (ver tokens.ts).
  token: z.string().regex(/^[0-9a-f]{64}$/, { error: 'El enlace no es válido' }),
  contrasena: contrasenaNueva,
});

export type DatosRegistro = z.output<typeof esquemaRegistro>;
export type DatosLogin = z.output<typeof esquemaLogin>;
export type DatosRecuperar = z.output<typeof esquemaRecuperar>;
export type DatosRestablecer = z.output<typeof esquemaRestablecer>;
