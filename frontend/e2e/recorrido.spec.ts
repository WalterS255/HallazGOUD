import { expect, test } from '@playwright/test';
import { AUTORA, FOTO_PNG, paginaCon, RECLAMANTE } from './ayudas';

// Fase J: el recorrido completo de la propuesta, en un navegador real y a 360 px.
// Dos personas a la vez, cada una en su propio navegador (contexto), como dos celulares:
// la autora encuentra un objeto y lo publica; el reclamante lo busca, lo reclama,
// conversan y los dos confirman la entrega.

test('publicar → buscar → reclamar → aceptar → conversar → entregar', async ({ browser }) => {
  // Título único por corrida: así no se confunde con publicaciones de corridas anteriores.
  const marca = Date.now().toString(36);
  const titulo = `Paraguas negro plegable ${marca}`;

  // Cada una con su sesión ya iniciada (e2e/sesiones.setup.ts).
  const autora = await paginaCon(browser, AUTORA);
  const reclamante = await paginaCon(browser, RECLAMANTE);

  let idPublicacion = '';
  await test.step('la autora publica el hallazgo con el asistente de 3 pasos (RNF-03)', async () => {
    await autora.goto('/publicar');
    // Paso 1: ¿qué?
    await autora.getByRole('button', { name: 'Encontré algo' }).click();
    await autora.locator('#titulo').fill(titulo);
    const ropa = await autora
      .locator('#id_categoria option', { hasText: 'Ropa y accesorios' })
      .getAttribute('value');
    await autora.locator('#id_categoria').selectOption(ropa!);
    await autora.locator('#descripcion').fill('Paraguas negro con mango de madera, plegable.');
    await autora.getByRole('button', { name: 'Siguiente →' }).click();
    // Paso 2: ¿dónde y cuándo? (la fecha ya viene en hoy)
    const biblioteca = await autora
      .locator('#id_lugar option', { hasText: 'Biblioteca' })
      .first()
      .getAttribute('value');
    await autora.locator('#id_lugar').selectOption(biblioteca!);
    await autora.getByLabel('Hora aproximada').fill('08:00');
    await autora.getByRole('button', { name: 'Siguiente →' }).click();
    // Paso 3: foto y detalle reservado
    await autora
      .locator('input[type=file]')
      .setInputFiles({ name: 'paraguas.png', mimeType: 'image/png', buffer: FOTO_PNG });
    await autora.locator('#detalle_reservado').fill('Tiene una cinta amarilla atada al mango');
    await autora.getByRole('button', { name: 'Publicar' }).click();

    await autora.waitForURL(/\/publicaciones\/\d+$/);
    idPublicacion = autora.url().split('/').pop()!;
    await expect(autora.getByRole('heading', { name: titulo })).toBeVisible();
    // Solo la autora ve su detalle reservado.
    await expect(autora.getByText('Tiene una cinta amarilla atada al mango')).toBeVisible();
  });

  await test.step('el reclamante lo encuentra en el catálogo y lo reclama', async () => {
    await reclamante.goto(`/publicaciones?q=${encodeURIComponent('paraguas plegable')}`);
    await reclamante.getByText(titulo).click();
    await reclamante.waitForURL(`**/publicaciones/${idPublicacion}`);
    // Regla 6.3: el detalle reservado NO aparece para nadie más.
    await expect(reclamante.getByText('cinta amarilla')).toHaveCount(0);

    await reclamante.getByRole('button', { name: 'Es mío, quiero reclamarlo' }).click();
    await reclamante.locator('#respuesta_detalle').fill('Tiene una cinta amarilla en el mango');
    await reclamante.getByRole('button', { name: 'Enviar reclamación' }).click();
    await expect(reclamante.getByText('Tu reclamación está')).toBeVisible();
  });

  let urlChat = '';
  await test.step('la autora compara la respuesta con su detalle y acepta', async () => {
    await autora.goto(`/publicaciones/${idPublicacion}`);
    await expect(autora.getByText('Tiene una cinta amarilla en el mango')).toBeVisible();
    await autora.getByRole('button', { name: 'Aceptar y abrir chat' }).click();
    await autora.waitForURL(/\/mensajes\/\d+/);
    urlChat = new URL(autora.url()).pathname;
  });

  await test.step('conversan por el chat interno, sin datos de contacto (RF-20, RF-22)', async () => {
    await autora.getByPlaceholder('Escribe un mensaje…').fill('Hola, lo tengo. ¿Mañana a las 10?');
    await autora.getByRole('button', { name: 'Enviar' }).click();
    await expect(autora.getByText('Hola, lo tengo. ¿Mañana a las 10?')).toBeVisible();

    // El reclamante lo ve en su lista de chats y responde.
    await reclamante.goto('/mensajes');
    await reclamante.getByText(titulo).click();
    await reclamante.waitForURL((u) => u.pathname === urlChat); // el enlace trae ?publicacion=…
    await expect(reclamante.getByText('Hola, lo tengo. ¿Mañana a las 10?')).toBeVisible();
    await reclamante.getByPlaceholder('Escribe un mensaje…').fill('¡Perfecto, gracias!');
    await reclamante.getByRole('button', { name: 'Enviar' }).click();
    await expect(reclamante.getByText('¡Perfecto, gracias!')).toBeVisible();
  });

  await test.step('las dos partes confirman la entrega (RF-21)', async () => {
    await reclamante.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(reclamante.getByText('Confirmaste la entrega')).toBeVisible();

    // La autora recarga el chat: ve la respuesta y que el reclamante ya confirmó.
    await autora.reload();
    await expect(autora.getByText('¡Perfecto, gracias!')).toBeVisible();
    await expect(autora.getByText('ya confirmó la entrega')).toBeVisible();
    await autora.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(autora.getByText('Entrega confirmada por ambas partes')).toBeVisible();
    // El chat queda en solo lectura.
    await expect(autora.getByPlaceholder('Escribe un mensaje…')).toHaveCount(0);
  });

  await test.step('la publicación queda ENTREGADA', async () => {
    await reclamante.goto(`/publicaciones/${idPublicacion}`);
    await expect(reclamante.getByText('Entregada', { exact: true })).toBeVisible();
  });
});
