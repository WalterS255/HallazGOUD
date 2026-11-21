import { expect, type Page } from '@playwright/test';

// Usuarios del seed (backend/prisma/seed.ts). La contraseña sale del .env (CONTRASENA_SEED).
export const AUTORA = 'usuario.prueba@udistrital.edu.co';
export const RECLAMANTE = 'moderador.prueba@udistrital.edu.co';

export function contrasenaSeed(): string {
  const c = process.env.CONTRASENA_SEED;
  if (!c) throw new Error('Falta CONTRASENA_SEED en el .env de la raíz (la de los usuarios del seed).');
  return c;
}

// Inicia sesión por el formulario, como una persona. Se buscan los campos por su
// etiqueta: si una etiqueta se pierde, la prueba falla (y eso también es accesibilidad).
export async function iniciarSesion(page: Page, correo: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo institucional').fill(correo);
  await page.getByLabel('Contraseña').fill(contrasenaSeed());
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

// PNG válido de 1×1 px: suficiente para que el backend lo acepte y lo convierta a WEBP.
export const FOTO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
