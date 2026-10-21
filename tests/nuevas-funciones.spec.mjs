import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../docs/evidencias/', import.meta.url);
const run = `${process.env.REALIMENTA_UI_RUN_ID || Date.now().toString(36)}-nuevas`;
const recoveryEmail = 'recovery.ui@realimenta.test';
const recoveryPassword = 'RecuperadaUi2026!';
const photoFile = fileURLToPath(new URL('../assets/images/alimentos/pan.jpg', import.meta.url));
const summary = { ejecucion: run, fecha_inicio: new Date().toISOString(), navegador: 'Chrome del sistema mediante Playwright', pruebas: [], registros_creados: [], errores_javascript: [], peticiones_simuladas: false };

async function saveSummary() {
  await mkdir(output, { recursive: true });
  const target = new URL('nuevas-funciones-resumen.json', output);
  let prior = {};
  try { const saved = JSON.parse(await readFile(target, 'utf8')); if (saved.ejecucion === run) prior = saved; } catch { /* Primera escritura de la ejecución. */ }
  const result = { ...prior, ...summary, fecha_fin: new Date().toISOString() };
  for (const key of ['pruebas', 'registros_creados', 'errores_javascript']) {
    result[key] = [...new Map([...(prior[key] || []), ...summary[key]].map(value => [JSON.stringify(value), value])).values()];
  }
  await writeFile(target, JSON.stringify(result, null, 2));
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => summary.errores_javascript.push(error.message));
});
test.afterEach(async ({}, info) => {
  summary.pruebas.push({ nombre: info.title, estado: info.status, duracion_ms: info.duration, error: info.error?.message || null });
  await saveSummary();
});
test.afterAll(saveSummary);

async function login(page, role = 'donante') {
  await page.goto('/login.html');
  await page.locator(`[data-demo-account="${role}"]`).click();
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('.mvp-dashboard-grid')).toBeVisible();
}

function limaInput(minutes) {
  return new Date(Date.now() + minutes * 60_000 - 5 * 3_600_000).toISOString().slice(0, 16);
}

async function fillDonation(page) {
  const food = `Prueba UI ${run} foto propia`;
  await page.locator('.sidebar-nav [data-view="nueva-donacion"]').click();
  const form = page.locator('#donation-form');
  await expect(form).toBeVisible();
  await form.locator('[name="alimento"]').fill(food);
  await form.locator('[name="categoria"]').selectOption({ label: 'Panadería' });
  await form.locator('[name="cantidad"]').fill('14');
  await form.locator('[name="unidad"]').selectOption('unidades');
  await form.locator('[name="envase"]').fill('Envase cerrado de demostración UI');
  await form.locator('[name="fecha_disponibilidad"]').fill(limaInput(2));
  await form.locator('[name="fecha_limite_recojo"]').fill(limaInput(240));
  await form.locator('[name="fecha_limite_aprovechamiento_declarada"]').fill(limaInput(480));
  await form.locator('[name="ubicacion_confirmada"]').check();
  return { food, form };
}

async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(sizes.document, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport + 1);
  expect(sizes.body, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport + 1);
  return sizes;
}

test('Foto propia: valida SVG, muestra vista previa y persiste imagen real tras recargar', async ({ page }) => {
  await login(page);
  const { food, form } = await fillDonation(page);
  const file = form.locator('input[type="file"][name="foto"]');
  await expect(file).toHaveAttribute('accept', /image\/jpeg.*image\/png.*image\/webp|\.jpe?g/i);
  await file.setInputFiles({ name: 'rechazada.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>') });
  await expect(form.locator('[data-photo-error], [data-form-error], [role="alert"]').filter({ hasText: /JPEG|JPG|PNG|WebP|formato|imagen/i }).first()).toBeVisible();
  await file.setInputFiles(photoFile);
  const selectedFileBytes = await file.evaluate(element => element.files[0].size);
  expect(selectedFileBytes).toBeGreaterThan(1000);
  const preview = form.locator('[data-photo-preview]');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate(element => {
    const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
    return Boolean(image?.complete && image.naturalWidth > 0);
  })).toBe(true);
  await form.screenshot({ path: fileURLToPath(new URL('foto-formulario.png', output)) });

  const donationResponse = page.waitForResponse(response => /\/api\/donaciones$/.test(response.url()) && response.request().method() === 'POST');
  const imageResponse = page.waitForResponse(response => /\/api\/donaciones\/\d+\/foto$/.test(response.url()) && response.request().method() === 'POST');
  await form.locator('button[type="submit"]').click();
  const created = await donationResponse;
  const donation = (await created.json()).data;
  expect(created.status()).toBe(201);
  summary.registros_creados.push({ id_donacion: donation.id_donacion, alimento: food });
  const uploaded = await imageResponse;
  expect(uploaded.ok(), `HTTP de subida: ${uploaded.status()}`).toBe(true);
  expect(uploaded.request().headers()['content-type']).toMatch(/^image\/jpeg/);
  await expect(page.locator('#main-content h1')).toHaveText(food);
  await page.reload();
  await expect(page.locator('.mvp-dashboard-grid')).toBeVisible();
  await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
  const card = page.locator('.mvp-donation-card').filter({ hasText: food });
  const image = card.locator('img[src*="/media/donaciones/"]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  const source = await image.getAttribute('src');
  const media = await page.request.get(source);
  expect(media.status()).toBe(200);
  expect(media.headers()['content-type']).toMatch(/^image\/webp/);
  expect(source).toMatch(/\/media\/donaciones\/[a-f0-9]{40}\.webp$/);
  summary.foto_propia = { id_donacion: donation.id_donacion, url: source, bytes_originales_seleccionados: selectedFileBytes, bytes_webp: (await media.body()).length, persistencia_recarga: true, svg_rechazado_cliente: true };

  const session = (await (await page.request.get('/api/auth/me')).json());
  const svg = await page.request.post(`/api/donaciones/${donation.id_donacion}/foto`, { headers: { 'Content-Type': 'image/svg+xml', 'x-csrf-token': session.csrfToken }, data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  expect([400, 415, 422]).toContain(svg.status());
  summary.foto_propia.svg_rechazado_api = svg.status();
  expect(summary.errores_javascript).toEqual([]);
});

test('Recuperación demostrativa: código visible, confirmación y acceso con contraseña nueva de cuenta aislada', async ({ page }) => {
  await page.goto('/recuperar.html');
  await expect(page.locator('.recovery-demo-notice')).toContainText('No se envían correos reales');
  const request = page.locator('#recovery-request-form');
  await request.locator('[name="correo"]').fill(recoveryEmail);
  await request.locator('button[type="submit"]').click();
  const reset = page.locator('#recovery-reset-form');
  await expect(reset).toBeVisible();
  await expect(reset.locator('[name="correo"]')).toHaveValue(recoveryEmail);
  const code = (await page.locator('[data-recovery-code]').textContent()).trim();
  expect(code.length).toBeGreaterThanOrEqual(6);
  await reset.locator('[name="codigo"]').fill(code);
  await reset.locator('[name="contrasena"]').fill(recoveryPassword);
  await reset.locator('[name="confirmacion"]').fill('NoCoincideUi2026!');
  await reset.locator('button[type="submit"]').click();
  await expect(page.getByText(/contraseñas no coinciden/i)).toBeVisible();
  await reset.locator('[name="confirmacion"]').fill(recoveryPassword);
  await page.screenshot({ path: fileURLToPath(new URL('recuperacion-demo.png', output)), fullPage: true });
  await reset.locator('button[type="submit"]').click();
  await expect(page.locator('[data-recovery-success]')).toBeVisible();
  await expect(page.locator('[data-recovery-success] a[href="login.html"]')).toBeVisible();
  await page.goto('/login.html');
  await page.locator('#login-email').fill(recoveryEmail);
  await page.locator('#login-password').fill(recoveryPassword);
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page).toHaveURL(/donante\.html/);
  await expect(page.locator('.mvp-dashboard-grid')).toBeVisible();
  summary.recuperacion = { cuenta_aislada: recoveryEmail, codigo_demo_visible: true, contrasena_actualizada: true, login_comprobado: true, cuentas_principales_modificadas: false };
  expect(summary.errores_javascript).toEqual([]);
});

test('Responsive nuevo: login, recuperación y formulario con fotografía sin desbordamiento a 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/login.html');
  const loginSize = await noOverflow(page);
  await page.goto('/recuperar.html');
  await expect(page.locator('#recovery-request-form')).toBeVisible();
  await page.locator('#recovery-request-form [name="correo"]').fill(recoveryEmail);
  await page.locator('#recovery-request-form button[type="submit"]').click();
  await expect(page.locator('#recovery-reset-form')).toBeVisible();
  const recoverySize = await noOverflow(page);
  await page.screenshot({ path: fileURLToPath(new URL('recuperacion-movil.png', output)) });
  await login(page);
  await page.locator('[data-sidebar-open]').click();
  await page.locator('.sidebar-nav [data-view="nueva-donacion"]').click();
  await expect(page.locator('#donation-form')).toBeVisible();
  await expect.poll(() => page.locator('#app-sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  const formSize = await noOverflow(page);
  summary.responsive = { ancho: 360, login: loginSize, recuperacion: recoverySize, formulario: formSize };
  expect(summary.errores_javascript).toEqual([]);
});

test('Cinco fondos locales: recursos reales, degradados y fotografía de pan íntegra en vistas del donante', async ({ page }) => {
  const assets = [
    'feria-gastronomica-puno.jpeg',
    'trucha-plato-andino.jpeg',
    'plato-tradicional-andino.png',
    'pan-artesanal-marca-original.jpeg',
    'quesos-artesanales.jpeg'
  ];
  const resources = [];
  for (const asset of assets) {
    const response = await page.request.get(`/assets/images/fondos/${asset}`);
    expect(response.status(), asset).toBe(200);
    expect(response.headers()['content-type'], asset).toMatch(/^image\/(jpeg|png)/);
    resources.push({ archivo: asset, estado: response.status(), bytes: (await response.body()).length });
  }
  await login(page);
  await expect(page.locator('body')).toHaveAttribute('data-ambient', 'feria');
  const header = page.locator('.mvp-page-header.has-ambience');
  await expect(header.locator('.ambience-header-photo[data-ambient-image="feria"]')).toBeVisible();
  expect(await header.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
  await page.screenshot({ path: fileURLToPath(new URL('fondos-donante.png', output)) });
  const views = [['mis-donaciones', 'quesos'], ['solicitudes', 'plato'], ['seguimiento', 'trucha'], ['nueva-donacion', 'pan']];
  for (const [view, image] of views) {
    await page.locator(`.sidebar-nav [data-view="${view}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-ambient', image);
    await expect(page.locator(`.ambience-header-photo[data-ambient-image="${image}"]`)).toBeVisible();
  }
  const bread = page.locator('.ambience-header-photo[data-ambient-image="pan"]');
  expect(await bread.evaluate(element => getComputedStyle(element).backgroundSize)).toBe('contain');
  expect(await bread.evaluate(element => getComputedStyle(element, '::after').display)).toBe('none');
  await expect(page.locator('.ambience-original-caption')).toContainText(/marca de agua original conservada/i);
  await page.screenshot({ path: fileURLToPath(new URL('fondo-pan-integro.png', output)) });
  await page.setViewportSize({ width: 360, height: 800 });
  const mobile = await noOverflow(page);
  await page.screenshot({ path: fileURLToPath(new URL('fondo-pan-movil.png', output)) });
  summary.fondos = { recursos: resources, vistas: ['dashboard', ...views.map(([view]) => view)], pan_sin_recorte: true, marca_original_conservada_css: true, movil: mobile };
  expect(summary.errores_javascript).toEqual([]);
});
