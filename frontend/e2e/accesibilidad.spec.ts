import AxeBuilder from '@axe-core/playwright';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { AUTORA, iniciarSesion, RECLAMANTE } from './ayudas';

// Fase J · RNF-05 (WCAG 2.1 AA) y RNF-04 (responsivo desde 360 px).
// axe-core revisa cada pantalla con las reglas automáticas de WCAG 2.1 A y AA:
// contraste, etiquetas de los campos, nombres de los botones, idioma, títulos, ARIA…
// Se revisa en los DOS temas (oscuro y claro), porque el contraste cambia con los colores.
// Lo que axe no puede juzgar (orden lógico del foco, textos alternativos con sentido)
// queda en la lista de revisión manual de docs/pruebas.md.

const REGLAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TEMAS = ['dark', 'light'] as const;

type Pantalla = { nombre: string; ruta: string | (() => string); quien: 'visitante' | 'usuario' | 'moderador' };

let idPublicacion = 0;
const PANTALLAS: Pantalla[] = [
  { nombre: 'Inicio', ruta: '/', quien: 'visitante' },
  { nombre: 'Catálogo', ruta: '/publicaciones', quien: 'visitante' },
  { nombre: 'Ficha (visitante)', ruta: () => `/publicaciones/${idPublicacion}`, quien: 'visitante' },
  { nombre: 'Ingresar', ruta: '/login', quien: 'visitante' },
  { nombre: 'Crear cuenta', ruta: '/registro', quien: 'visitante' },
  { nombre: 'Recuperar contraseña', ruta: '/recuperar', quien: 'visitante' },
  { nombre: 'Privacidad', ruta: '/privacidad', quien: 'visitante' },
  { nombre: 'Publicar (paso 1)', ruta: '/publicar', quien: 'usuario' },
  { nombre: 'Ficha (con sesión)', ruta: () => `/publicaciones/${idPublicacion}`, quien: 'usuario' },
  { nombre: 'Mis publicaciones', ruta: '/mis-publicaciones', quien: 'usuario' },
  { nombre: 'Mensajes', ruta: '/mensajes', quien: 'usuario' },
  { nombre: 'Notificaciones', ruta: '/notificaciones', quien: 'usuario' },
  { nombre: 'Perfil', ruta: '/perfil', quien: 'usuario' },
  { nombre: 'Administración', ruta: '/admin', quien: 'moderador' },
];

// Una sesión por persona para TODA la revisión (el login permite 5 por minuto).
// Sin modo 'serial': ese modo se salta todas las pruebas que siguen a un fallo.
// Las sesiones se comparten igual porque hay un solo trabajador (playwright.config.ts).
const contextos: Partial<Record<Pantalla['quien'], BrowserContext>> = {};

async function contextoDe(browser: Browser, quien: Pantalla['quien']): Promise<BrowserContext> {
  if (!contextos[quien]) {
    const ctx = await browser.newContext();
    if (quien !== 'visitante') {
      await iniciarSesion(await ctx.newPage(), quien === 'usuario' ? AUTORA : RECLAMANTE);
    }
    contextos[quien] = ctx;
  }
  return contextos[quien]!;
}

test.beforeAll(async ({ request }) => {
  // Una publicación cualquiera para revisar la ficha.
  const res = await request.get('/api/publicaciones?limite=1');
  idPublicacion = (await res.json()).datos[0]?.id;
  expect(idPublicacion, 'Hace falta al menos una publicación ACTIVA (corre el recorrido)').toBeTruthy();
});

test.afterAll(async () => {
  for (const ctx of Object.values(contextos)) await ctx?.close();
});

// Resumen legible: regla, impacto, cuántos elementos y un ejemplo de cada una.
function resumir(violaciones: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violaciones.map((v) => ({
    regla: v.id,
    impacto: v.impact,
    que: v.help,
    elementos: v.nodes.length,
    ejemplo: v.nodes[0]?.target.join(' ') + ' → ' + (v.nodes[0]?.failureSummary ?? '').split('\n').slice(1, 2).join(''),
  }));
}

async function anchoDesbordado(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const tema of TEMAS) {
  for (const p of PANTALLAS) {
    test(`${p.nombre} · tema ${tema === 'dark' ? 'oscuro' : 'claro'}`, async ({ browser }) => {
      const ctx = await contextoDe(browser, p.quien);
      const page = await ctx.newPage();
      // El tema se guarda en localStorage (BotonTema): se fija ANTES de que cargue la página.
      await page.addInitScript((t) => localStorage.setItem('tema', t), tema);
      await page.goto(typeof p.ruta === 'function' ? p.ruta() : p.ruta);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema === 'light' ? 'light' : /dark|^$/);

      const { violations } = await new AxeBuilder({ page }).withTags(REGLAS_WCAG).analyze();
      expect(resumir(violations), `WCAG 2.1 AA en ${p.nombre}`).toEqual([]);

      // RNF-04: nada se sale por el costado a 360 px.
      expect(await anchoDesbordado(page), 'desplazamiento horizontal (px)').toBeLessThanOrEqual(0);
      await page.close();
    });
  }
}

// axe no puede probar el uso con teclado: se prueba aquí (WCAG 2.1.1, 2.4.1 y 2.4.7).
test('solo con el teclado: saltar al contenido, foco visible e ingresar', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');

  // 2.4.1: lo PRIMERO que alcanza Tab es "Saltar al contenido", y lleva al <main>.
  await page.keyboard.press('Tab');
  const saltar = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(saltar).toBeFocused();
  await expect(saltar).toBeVisible(); // oculto hasta recibir el foco, pero entonces se ve

  // 2.4.7: cada elemento enfocado muestra un contorno visible.
  const contornoVisible = () =>
    page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e) return false;
      const s = getComputedStyle(e);
      return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
    });
  await page.getByLabel('Correo institucional').focus();
  expect(await contornoVisible(), 'el campo de correo enfocado no muestra el foco').toBe(true);

  // 2.1.1: se puede iniciar sesión sin mouse (escribir, Tab, escribir, Enter).
  await page.keyboard.type(AUTORA);
  await page.keyboard.press('Tab');
  expect(await contornoVisible(), 'el campo de contraseña enfocado no muestra el foco').toBe(true);
  await page.keyboard.type(process.env.CONTRASENA_SEED ?? '');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
  await page.context().close();
});
