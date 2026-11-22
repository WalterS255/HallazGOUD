import { expect, test } from '@playwright/test';

// Hallazgos de OWASP ZAP (Fase J) convertidos en pruebas, para que no vuelvan.

// ZAP envió el login antes de que cargara el JavaScript y la contraseña viajó en la URL
// (/login?contrasena=…). Le pasaría a cualquiera con un celular lento que pulse "Ingresar"
// antes de tiempo. Con method="post" los datos van en el cuerpo, nunca en la dirección.
for (const [pantalla, campos] of [
  ['/login', ['#correo', '#contrasena']],
  ['/registro', ['#nombre', '#correo', '#contrasena']],
] as const) {
  test(`${pantalla} sin JavaScript: la contraseña nunca queda en la URL`, async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(pantalla);
    for (const c of campos)
      await page.locator(c).fill(c === '#correo' ? 'x@udistrital.edu.co' : 'Secreta-123456');
    await page.locator('form button[type=submit]').first().click();
    await page.waitForLoadState();
    expect(page.url()).not.toContain('Secreta');
    expect(page.url()).not.toContain('contrasena=');
    await ctx.close();
  });
}

// Encabezados de seguridad que ZAP pidió (next.config.ts).
test('las páginas envían los encabezados de seguridad', async ({ request }) => {
  const r = await request.get('/login');
  const h = r.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-powered-by']).toBeUndefined(); // no anunciar que es Next.js
});
