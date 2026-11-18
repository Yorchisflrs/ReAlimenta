import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const output = process.env.UI_EVIDENCE_DIR
  ? pathToFileURL(`${path.resolve(process.env.UI_EVIDENCE_DIR)}${path.sep}`)
  : new URL('../docs/evidencias/', import.meta.url);
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
  await form.locator('[name="categoria"]').selectOption({ label: 'Panadería y complementos' });
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

test('Fotos del alimento: rechaza SVG, pide tres ángulos, muestra vista previa y guarda WebP', async ({ page }) => {
  await login(page);
  const { food, form } = await fillDonation(page);
  const firstSlot = form.locator('.photo-slot-empty input').first();
  await expect(firstSlot).toHaveAttribute('accept', /image\/jpeg.*image\/png.*image\/webp|\.jpe?g/i);
  await firstSlot.setInputFiles({ name: 'rechazada.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>') });
  await expect(form.locator('[data-photo-error]')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await form.locator('.photo-slot-empty input').first().setInputFiles(photoFile);
    await expect(form.locator('.photo-slot.filled')).toHaveCount(i + 1);
  }
  await expect.poll(() => form.locator('.photo-slot.filled img').first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await form.screenshot({ path: fileURLToPath(new URL('foto-formulario.png', output)) });
  await form.locator('[name="declaracion_buen_estado"]').check();
  await form.locator('button[type="submit"]').click();
  const donationResponse = page.waitForResponse(response => /\/api\/donaciones$/.test(response.url()) && response.request().method() === 'POST');
  const imageResponse = page.waitForResponse(response => /\/api\/donaciones\/\d+\/foto$/.test(response.url()) && response.request().method() === 'POST');
  const download = page.waitForEvent('download');
  await page.locator('#app-dialog [data-action="confirm-publish"]').click();
  const created = await donationResponse;
  const donation = (await created.json()).data;
  expect(created.status()).toBe(201);
  summary.registros_creados.push({ id_donacion: donation.id_donacion, alimento: food });
  expect((await imageResponse).ok()).toBe(true);
  await download;
  await expect(page.locator('#main-content h1')).toHaveText(food);
  await page.reload();
  await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
  const image = page.locator('.mvp-donation-card').filter({ hasText: food }).locator('img[src*="/media/donaciones/"]');
  await expect(image).toBeVisible();
  const source = await image.getAttribute('src');
  const media = await page.request.get(source);
  expect(media.status()).toBe(200);
  expect(media.headers()['content-type']).toMatch(/^image\/webp/);
  const session = await (await page.request.get('/api/auth/me')).json();
  const svg = await page.request.post(`/api/donaciones/${donation.id_donacion}/foto`, { headers: { 'Content-Type': 'image/svg+xml', 'x-csrf-token': session.csrfToken }, data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  expect([400, 409, 415, 422]).toContain(svg.status());
  expect(summary.errores_javascript).toEqual([]);
});

test('Recuperación demostrativa: código visible, confirmación y acceso con contraseña nueva de cuenta aislada', async ({ page }) => {
  await page.goto('/recuperar.html');
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

test('Tres fondos nuevos: productos locales, degradados y ambientación persistente por vista', async ({ page }) => {
  const assets = [
    'entrega-productos-locales-v2.png',
    'pan-queso-local-v2.png',
    'cosecha-andina-v2.png'
  ];
  const resources = [];
  for (const asset of assets) {
    const response = await page.request.get(`/assets/images/fondos/${asset}`);
    expect(response.status(), asset).toBe(200);
    expect(response.headers()['content-type'], asset).toMatch(/^image\/(jpeg|png)/);
    resources.push({ archivo: asset, estado: response.status(), bytes: (await response.body()).length });
  }
  await login(page);
  await expect(page.locator('body')).toHaveAttribute('data-ambient', 'comunidad');
  const header = page.locator('.mvp-page-header.has-ambience');
  await expect(header.locator('.ambience-header-photo[data-ambient-image="comunidad"]')).toBeVisible();
  expect(await header.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
  await page.screenshot({ path: fileURLToPath(new URL('fondos-donante.png', output)) });
  expect(await page.locator('.app-main').evaluate(element=>getComputedStyle(element).backgroundImage)).toContain('entrega-productos-locales-v2.png');
  const views = [['mis-donaciones', 'pan'], ['solicitudes', 'comunidad'], ['seguimiento', 'cosecha'], ['nueva-donacion', 'pan']];
  for (const [view, image] of views) {
    await page.locator(`.sidebar-nav [data-view="${view}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-ambient', image);
    await expect(page.locator(`.ambience-header-photo[data-ambient-image="${image}"]`)).toBeVisible();
  }
  const bread = page.locator('.ambience-header-photo[data-ambient-image="pan"]');
  expect(await bread.evaluate(element => getComputedStyle(element).backgroundSize)).toBe('cover');
  expect(await bread.evaluate(element => getComputedStyle(element, '::after').backgroundImage)).toContain('linear-gradient');
  await expect(page.locator('.ambience-original-caption')).toHaveCount(0);
  await page.screenshot({ path: fileURLToPath(new URL('fondo-pan-integro.png', output)) });
  await page.setViewportSize({ width: 360, height: 800 });
  const mobile = await noOverflow(page);
  await page.screenshot({ path: fileURLToPath(new URL('fondo-pan-movil.png', output)) });
  summary.fondos = { recursos: resources, vistas: ['dashboard', ...views.map(([view]) => view)], imagenes_nuevas_generadas: true, fondos_degradados: true, movil: mobile };
  expect(summary.errores_javascript).toEqual([]);
});

test('Ojito de contraseña, consulta por código y expediente de verificación de una olla común', async ({ browser, page }) => {
  await page.goto('/registro.html');
  const password = page.locator('input[name="contrasena"]');
  await password.fill('clave1234');
  await page.locator('.password-toggle').first().click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByText('Marqué en el mapa un punto aproximado de mi local.')).toBeVisible();
  // Una olla común se registra (por API, con su foto) y el donante consulta un comprobante por su código.
  await login(page);
  const donation = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 20; canvas.getContext('2d').fillRect(0, 0, 20, 20);
    await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Juana Mamani Quispe', correo: `olla.${Date.now()}@gmail.com`, telefono: '951777888', rol: 'organizacion', contrasena: 'clave1234', acepta_datos: true, foto: { tipo: 'image/png', datos: canvas.toDataURL('image/png').split(',')[1] }, perfil: { nombre: 'Olla Común Prueba UI', tipo_organizacion: 'Olla Común', numero_beneficiarios: 45, dni_representante: '41414141', direccion: 'Jr. Lima 100', departamento: 'Puno', provincia: 'Puno', distrito: 'Puno', latitud: -15.84, longitud: -70.02, ubicacion_confirmada: true } }) });
    return (await REA.request('/api/donaciones', { method: 'POST', body: { declaracion_buen_estado: true, alimento: 'Quinua para consultar', categoria: 'Abarrotes y alimentos secos', cantidad: 10, unidad: 'kg', fecha_disponibilidad: new Date(Date.now() - 60000).toISOString(), fecha_limite_recojo: new Date(Date.now() + 5 * 3600000).toISOString(), direccion_recojo: 'Jr. Lima 450', distrito: 'Puno', latitud_recojo: -15.8402, longitud_recojo: -70.0278, conservacion_declarada: 'Temperatura ambiente', requiere_cadena_frio: false, envase: 'Bolsas cerradas' } })).data;
  });
  await page.locator('.sidebar-nav [data-view="consulta"]').click();
  await page.locator('#lookup-form [name="codigo"]').fill(donation.codigo_verificacion.replace('-', ''));
  await page.locator('#lookup-form button[type="submit"]').click();
  await expect(page.locator('.lookup-result')).toContainText('Quinua para consultar');
  // Administración: pista RUNOC, documento de respaldo y rechazo subsanable con historial.
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const admin = await context.newPage();
  try {
    await login(admin, 'admin');
    await admin.locator('.sidebar-nav [data-view="cuentas"]').click();
    await admin.locator('.admin-account-card').filter({ hasText: 'Olla Común Prueba UI' }).first().locator('[data-admin-action="open-file"]').click();
    const form = admin.locator('#admin-evaluation-form');
    await expect(form).toContainText('Ingrese el código RUNOC, si la organización cuenta con uno.');
    await admin.locator('[data-admin-documents]').setInputFiles({ name: 'acta.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
    await expect(admin.locator('.file-docs')).toContainText('acta.pdf');
    await form.locator('[name="codigo_registro"]').fill('RUNOC-2026-0451');
    await form.locator('[name="tipos"]').first().check();
    await form.locator('[name="resultado"]').selectOption('rechazado');
    await form.locator('[name="motivo"]').fill('No se pudo acreditar la constitución de la olla.');
    await form.locator('[name="subsanable"]').check();
    await form.locator('button[type="submit"]').click();
    await expect(admin.locator('.file-history .file-entry').first()).toContainText('Rechazada');
    await expect(admin.locator('.file-history')).toContainText('RUNOC-2026-0451');
    await expect(admin.locator('.file-history')).toContainText('acta.pdf');
    await admin.screenshot({ path: fileURLToPath(new URL('expediente-verificacion.png', output)) });
  } finally { await context.close(); }
  expect(summary.errores_javascript).toEqual([]);
});
