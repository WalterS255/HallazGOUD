import { expect, test } from '@playwright/test';
import { AUTORA, paginaCon, RECLAMANTE } from './ayudas';

// RF-10: el autor edita su publicación; con reclamaciones, el detalle reservado queda bloqueado.

test('la autora edita su publicación; el detalle se bloquea al llegar una reclamación', async ({ browser }) => {
  const autora = await paginaCon(browser, AUTORA);
  const otro = await paginaCon(browser, RECLAMANTE);

  // Publicación de partida, creada por la API con la sesión del navegador (más rápido
  // que el asistente, que ya se prueba en recorrido.spec.ts).
  const marca = Date.now().toString(36);
  const catalogos = await (await autora.request.get('/api/catalogos')).json();
  const creada = await autora.request.post('/api/publicaciones', {
    data: {
      tipo: 'ENCONTRADO',
      titulo: `Cartuchera roja ${marca}`,
      descripcion: 'Cartuchera de tela roja con cremallera',
      id_categoria: catalogos.categorias[0].id,
      id_lugar: catalogos.sedes[0].lugares[0].id,
      fecha_suceso: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      detalle_reservado: 'Tiene un llavero de dinosaurio',
    },
  });
  expect(creada.status()).toBe(201);
  const id = (await creada.json()).id as number;

  await test.step('desde la ficha, "Editar" abre el formulario con los datos actuales', async () => {
    await autora.goto(`/publicaciones/${id}`);
    await autora.getByRole('link', { name: 'Editar' }).click();
    await autora.waitForURL(`**/publicaciones/${id}/editar`);
    await expect(autora.getByLabel('Título')).toHaveValue(`Cartuchera roja ${marca}`);
    await expect(autora.getByLabel('Detalle reservado')).toHaveValue('Tiene un llavero de dinosaurio');
  });

  await test.step('guardar sin cambios avisa y no envía nada', async () => {
    await autora.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(autora.getByText('No cambiaste nada.')).toBeVisible();
  });

  await test.step('cambia el título y la hora: la ficha muestra lo nuevo', async () => {
    await autora.getByLabel('Título').fill(`Cartuchera roja con stickers ${marca}`);
    await autora.getByLabel('Hora aproximada').fill('07:15');
    await autora.getByRole('button', { name: 'Guardar cambios' }).click();
    await autora.waitForURL(`**/publicaciones/${id}`);
    await expect(autora.getByRole('heading', { name: `Cartuchera roja con stickers ${marca}` })).toBeVisible();
    await expect(autora.getByText('7:15 a. m.')).toBeVisible();
  });

  await test.step('otra persona no puede editarla', async () => {
    await otro.goto(`/publicaciones/${id}/editar`);
    await expect(otro.getByText('Solo quien publicó puede editar esta publicación.')).toBeVisible();
    await expect(otro.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
  });

  await test.step('con una reclamación, el detalle reservado ya no se puede cambiar', async () => {
    const r = await otro.request.post(`/api/publicaciones/${id}/reclamaciones`, {
      data: { respuesta_detalle: 'Un llavero de dinosaurio' },
    });
    expect(r.status()).toBe(201);
    await autora.goto(`/publicaciones/${id}/editar`);
    await expect(autora.getByLabel('Detalle reservado')).toBeDisabled();
    await expect(autora.getByText('Ya hay reclamaciones')).toBeVisible();
  });
});
