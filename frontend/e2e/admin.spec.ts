import { expect, type Page, test } from '@playwright/test';
import { ADMIN, paginaCon } from './ayudas';

// RF-28 (catálogos) y RF-29 (cuentas) desde el panel, como lo usaría el admin.
// Cada corrida usa nombres únicos; no toca los datos del seed.

let admin: Page;
const marca = Date.now().toString(36);

test.beforeAll(async ({ browser }) => {
  admin = await paginaCon(browser, ADMIN);
});

test.afterAll(async () => {
  await admin.context().close();
});

test('el panel enlaza a catálogos y cuentas', async () => {
  await admin.goto('/admin');
  await admin.getByRole('link', { name: /Catálogos/ }).click();
  await admin.waitForURL('**/admin/catalogos');
  await expect(admin.getByRole('heading', { name: 'Catálogos', level: 1 })).toBeVisible();
});

test('categorías: crear sensible, desactivar (sale del formulario de publicar) y volver a activar', async () => {
  const nombre = `Paraguas ${marca}`;
  await admin.goto('/admin/catalogos');
  await admin.getByLabel('Nombre', { exact: true }).fill(nombre);
  await admin.getByLabel('Ícono').selectOption('box');
  await admin.getByLabel(/Sensible \(documentos/).check();
  await admin.getByRole('button', { name: 'Crear categoría' }).click();

  const fila = admin.getByRole('listitem').filter({ hasText: nombre });
  await expect(fila).toBeVisible();
  await expect(fila.getByText('Sensible', { exact: true })).toBeVisible();

  const publicas = async () =>
    ((await (await admin.request.get('/api/catalogos')).json()).categorias as { nombre: string }[]).map((c) => c.nombre);
  expect(await publicas()).toContain(nombre);

  await fila.getByRole('button', { name: `Desactivar ${nombre}` }).click();
  await expect(fila.getByText('Desactivada')).toBeVisible();
  expect(await publicas()).not.toContain(nombre); // ya no se ofrece al publicar

  await fila.getByRole('button', { name: `Activar ${nombre}` }).click();
  await expect(fila.getByText('Desactivada')).toHaveCount(0);
});

test('sedes y lugares: crear, clasificar el lugar, y no borrar lo que está en uso', async () => {
  const sede = `Sede ${marca}`;
  await admin.goto('/admin/catalogos');
  await admin.getByLabel('Nombre de la nueva sede').fill(sede);
  await admin.getByRole('button', { name: 'Crear sede' }).click();
  const bloque = admin.getByRole('article').filter({ has: admin.getByRole('heading', { name: sede }) });
  await expect(bloque).toBeVisible();

  // Lugar nuevo, ya clasificado como biblioteca (edificio análogo, pregunta 13.2).
  await bloque.getByLabel(`Nuevo lugar en ${sede}`, { exact: true }).fill('Biblioteca');
  await bloque.getByLabel(`Tipo del nuevo lugar en ${sede}`, { exact: true }).selectOption('BIBLIOTECA');
  await bloque.getByRole('button', { name: `Agregar lugar en ${sede}` }).click();
  const tipo = bloque.getByLabel(`Tipo de lugar de Biblioteca (${sede})`, { exact: true });
  await expect(tipo).toHaveValue('BIBLIOTECA');

  // Cambiar el tipo se guarda solo (y sobrevive a recargar).
  await tipo.selectOption('CAFETERIA');
  await admin.waitForLoadState('networkidle');
  await admin.reload();
  await expect(bloque.getByLabel(`Tipo de lugar de Biblioteca (${sede})`, { exact: true })).toHaveValue('CAFETERIA');

  // Una sede con lugares no se borra: el backend responde 409 EN_USO y se muestra.
  await bloque.getByRole('button', { name: `Borrar la sede ${sede}` }).click();
  await expect(admin.getByText(/No se puede borrar/)).toBeVisible();
  await expect(bloque).toBeVisible();

  // Sin lugares, sí.
  await bloque.getByRole('button', { name: `Borrar Biblioteca de ${sede}` }).click();
  await expect(bloque.getByRole('listitem')).toHaveCount(0);
  await bloque.getByRole('button', { name: `Borrar la sede ${sede}` }).click();
  await expect(admin.getByRole('heading', { name: sede })).toHaveCount(0);
});

test('cuentas: buscar sin ver el correo, suspender con motivo y reactivar', async () => {
  // Cuenta desechable (sin verificar): nunca se suspende a un usuario del seed.
  const nombre = `Cuenta Prueba ${marca}`;
  const correo = `cuenta.${marca}@udistrital.edu.co`;
  const registro = await admin.request.post('/api/auth/registro', {
    data: { nombre, correo, programa: 'Sistemas', contrasena: 'Una-clave-123', aceptaPolitica: true },
  });
  expect(registro.status()).toBe(201);

  await admin.goto('/admin/cuentas');
  await admin.getByLabel('Buscar por nombre o por correo exacto').fill(nombre);
  await admin.getByRole('button', { name: 'Buscar' }).click();
  // La búsqueda recarga la página: hay que esperar a que React "hidrate" los botones,
  // si no el clic cae sobre HTML todavía sin comportamiento (pasa con el servidor de desarrollo).
  await admin.waitForLoadState('networkidle');
  const fila = admin.getByRole('listitem').filter({ hasText: nombre });
  await expect(fila).toBeVisible();
  await expect(admin.getByText(correo)).toHaveCount(0); // regla 6.3: nunca el correo

  await fila.getByRole('button', { name: `Suspender a ${nombre}` }).click();
  await fila.getByLabel('Motivo (se le envía a la persona)').fill('Publicaciones falsas');
  await fila.getByRole('button', { name: 'Confirmar suspensión' }).click();
  await expect(fila.getByText('Suspendida')).toBeVisible();

  await fila.getByRole('button', { name: `Reactivar a ${nombre}` }).click();
  await expect(fila.getByText('Activa', { exact: true })).toBeVisible();
});

test('el admin no puede suspenderse a sí mismo (no aparece el botón)', async () => {
  await admin.goto('/admin/cuentas?q=Admin%20de%20Prueba');
  const yo = admin.getByRole('listitem').filter({ hasText: 'Admin de Prueba' });
  await expect(yo).toBeVisible();
  await expect(yo.getByRole('button', { name: /Suspender/ })).toHaveCount(0);
});
