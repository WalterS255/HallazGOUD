import { test as preparar } from '@playwright/test';
import { ADMIN, AUTORA, archivoSesion, iniciarSesion, RECLAMANTE } from './ayudas';

// Paso previo a todas las pruebas: inicia sesión UNA vez por usuario del seed y guarda la
// sesión (la cookie) en e2e/.auth/. Las pruebas abren el navegador ya con esa sesión.
// Sin esto cada prueba iniciaba sesión por su cuenta (~10 por corrida) y el límite del
// login (5 por minuto por IP) cortaba la corrida con 429.
for (const correo of [AUTORA, RECLAMANTE, ADMIN]) {
  preparar(`sesión de ${correo}`, async ({ browser }) => {
    const ctx = await browser.newContext();
    await iniciarSesion(await ctx.newPage(), correo);
    await ctx.storageState({ path: archivoSesion(correo) });
    await ctx.close();
  });
}
