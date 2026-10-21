import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputDirectory = new URL('../docs/evidencias/', import.meta.url);
const screenshotPath = name => fileURLToPath(new URL(name, outputDirectory));
const runId = process.env.REALIMENTA_UI_RUN_ID || Date.now().toString(36);
const evidence = {
  fecha_inicio: new Date().toISOString(),
  ejecucion: runId,
  navegador: 'Google Chrome del sistema / Playwright',
  proveedor_real_sin_mocks: true,
  pruebas: [],
  registros_creados: [],
  errores_javascript: [],
  errores_consola: [],
  respuestas_api_error: []
};

function observe(page, name) {
  page.on('pageerror', error => evidence.errores_javascript.push({ pagina: name, mensaje: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') evidence.errores_consola.push({ pagina: name, mensaje: message.text() });
  });
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 400) evidence.respuestas_api_error.push({ pagina: name, url: response.url(), estado: response.status() });
  });
}

async function saveEvidence() {
  await mkdir(outputDirectory, { recursive: true });
  const file = new URL('ui-resumen.json', outputDirectory);
  let previous = {};
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.ejecucion === runId) previous = saved;
  } catch { /* Primera escritura de esta ejecución. */ }
  const merged = { ...previous, ...evidence, fecha_fin: new Date().toISOString() };
  for (const key of ['pruebas', 'registros_creados', 'errores_javascript', 'errores_consola', 'respuestas_api_error']) {
    merged[key] = [...new Map([...(previous[key] || []), ...evidence[key]].map(value => [JSON.stringify(value), value])).values()];
  }
  await writeFile(file, JSON.stringify(merged, null, 2));
}

function limaInput(addMinutes) {
  return new Date(Date.now() + addMinutes * 60_000 - 5 * 3_600_000).toISOString().slice(0, 16);
}

async function login(page, role) {
  await page.goto('/login.html');
  await page.locator(`[data-demo-account="${role}"]`).click();
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${role === 'admin' ? 'administrador' : role}\\.html`));
  await expect(page.locator('[data-account-name]')).not.toHaveText(/Cargando|^$/);
  await expect(page.locator('.mvp-dashboard-grid')).toBeVisible();
}

async function createDonation(page, suffix) {
  const name = `Prueba UI ${runId} ${suffix}`;
  await page.locator('.sidebar-nav [data-view="nueva-donacion"]').click();
  const form = page.locator('#donation-form');
  await expect(form).toBeVisible();
  await form.locator('[name="alimento"]').fill(name);
  await form.locator('[name="categoria"]').selectOption({ label: 'Panadería' });
  await form.locator('[name="cantidad"]').fill('12');
  await form.locator('[name="unidad"]').selectOption('unidades');
  await form.locator('[name="descripcion"]').fill('Registro de demostración creado mediante formularios durante la prueba UI automatizada.');
  await form.locator('[name="envase"]').fill('Bolsa cerrada de demostración');
  await form.locator('[name="fecha_disponibilidad"]').fill(limaInput(2));
  await form.locator('[name="fecha_limite_recojo"]').fill(limaInput(240));
  await form.locator('[name="fecha_limite_aprovechamiento_declarada"]').fill(limaInput(480));
  const latitude = await form.locator('[name="latitud_recojo"]').inputValue();
  const longitude = await form.locator('[name="longitud_recojo"]').inputValue();
  expect(Number.isFinite(Number(latitude)) && latitude !== '').toBeTruthy();
  expect(Number.isFinite(Number(longitude)) && longitude !== '').toBeTruthy();
  await form.locator('[name="ubicacion_confirmada"]').check();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/donaciones') && r.request().method() === 'POST'),
    form.locator('button[type="submit"]').click()
  ]);
  const result = await response.json();
  expect(response.status(), JSON.stringify(result)).toBe(201);
  const donation = result.data;
  evidence.registros_creados.push({ id_donacion: donation.id_donacion, alimento: name, coordenadas: [Number(latitude), Number(longitude)] });
  await expect(page.locator('#main-content h1')).toHaveText(name);
  return { ...donation, alimento: name };
}

async function findDonation(page, donation) {
  await page.locator('.sidebar-nav [data-view="disponibles"]').click();
  await page.locator('[data-filter="q"]').fill(donation.alimento);
  const card = page.locator('.mvp-donation-card').filter({ hasText: donation.alimento });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Ver detalles', exact: true }).click();
  await expect(page.locator('#main-content h1')).toHaveText(donation.alimento);
}

async function submitRequest(page) {
  await page.locator('[data-action="new-request"]').click();
  const form = page.locator('#request-form');
  await expect(form).toBeVisible();
  await form.locator('[name="fecha_propuesta"]').fill(limaInput(45));
  await form.locator('[name="transporte_declarado"]').fill('Vehículo de demostración para prueba UI');
  await form.locator('[name="recipiente_declarado"]').fill('Contenedor cerrado de demostración');
  await form.locator('[name="observaciones"]').fill('Prueba UI auditable; datos de las cuentas públicas de demostración.');
  const [response] = await Promise.all([
    page.waitForResponse(r => /\/api\/donaciones\/\d+\/solicitudes$/.test(r.url()) && r.request().method() === 'POST'),
    form.locator('button[type="submit"]').click()
  ]);
  const result = await response.json();
  expect(response.status(), JSON.stringify(result)).toBe(201);
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  return result.data;
}

async function expectNoHorizontalScroll(page) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  return dimensions;
}

test.afterEach(async ({}, testInfo) => {
  evidence.pruebas.push({ nombre: testInfo.title, estado: testInfo.status, duracion_ms: testInfo.duration, error: testInfo.error?.message || null });
  await saveEvidence();
});

test.afterAll(async () => {
  await saveEvidence();
});

test('E2E real: publicar, recargar, consultar ruta por carretera, solicitar y aceptar', async ({ browser, page }) => {
  observe(page, 'donante');
  await mkdir(outputDirectory, { recursive: true });
  await page.goto('/');
  await expect(page.getByRole('link', { name: /REAlimenta|REAlimenta, inicio/ }).first()).toBeVisible();
  await page.screenshot({ path: screenshotPath('landing-desktop.png'), fullPage: true });
  await page.screenshot({ path: screenshotPath('portada-vista.png') });
  await login(page, 'donante');
  await page.screenshot({ path: screenshotPath('donante-desktop.png'), fullPage: true });
  const donation = await createDonation(page, 'aceptacion');
  await page.reload();
  await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
  await expect(page.locator('.mvp-donation-card').filter({ hasText: donation.alimento })).toHaveCount(1);

  const organizationContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-PE', timezoneId: 'America/Lima', baseURL: test.info().project.use.baseURL });
  const organization = await organizationContext.newPage();
  observe(organization, 'organizacion');
  try {
    await login(organization, 'organizacion');
    await findDonation(organization, donation);
    const [routeResponse] = await Promise.all([
      organization.waitForResponse(r => /\/api\/donaciones\/\d+\/evaluacion$/.test(r.url()), { timeout: 35_000 }),
      organization.locator('#route-form button[type="submit"]').click()
    ]);
    const routeResult = await routeResponse.json();
    expect(routeResponse.status(), JSON.stringify(routeResult)).toBe(200);
    const { ruta, evaluacion } = routeResult.data;
    expect(ruta.geometry.type).toBe('LineString');
    expect(ruta.geometry.coordinates.length).toBeGreaterThan(2);
    expect(ruta.distancia_km).toBeGreaterThan(0);
    expect(ruta.duracion_estimada_min).toBeGreaterThan(0);
    expect(ruta.proveedor).toMatch(/OSRM|OpenRouteService/);
    expect(ruta.trafico_en_vivo).toBe(false);
    expect(evaluacion.estado_viabilidad).toBe('verde');
    evidence.ruta_real = { id_donacion: donation.id_donacion, proveedor: ruta.proveedor, fecha_calculo: ruta.fecha_calculo, distancia_km: ruta.distancia_km, duracion_estimada_min: ruta.duracion_estimada_min, puntos_geometria: ruta.geometry.coordinates.length, estado_viabilidad: evaluacion.estado_viabilidad, tiles: null };
    await expect(organization.locator('#route-evaluation .tone-verde')).toBeVisible();
    await expect(organization.locator('#delivery-map path.leaflet-interactive')).toHaveCount(1);
    await organization.locator('#delivery-map').scrollIntoViewIfNeeded();
    await expect.poll(async () => organization.locator('#delivery-map').evaluate(container => {
      const images = [...container.querySelectorAll('.leaflet-tile')];
      const signature = images.map(image => `${image.src}|${image.style.transform}`).join(';');
      const loaded = images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0) && !container.classList.contains('leaflet-zoom-anim');
      const previous = window.__realimentaE2ETiles;
      if (!loaded || !previous || previous.signature !== signature) {
        window.__realimentaE2ETiles = { signature, since: performance.now() };
        return false;
      }
      return performance.now() - previous.since >= 750;
    }), { timeout: 30_000, intervals: [100, 200, 300] }).toBe(true);
    const tiles = await organization.locator('#delivery-map .leaflet-tile').evaluateAll(images => ({ total: images.length, cargadas: images.filter(image => image.complete && image.naturalWidth > 0).length }));
    evidence.ruta_real.tiles = tiles;
    expect(tiles.cargadas).toBe(tiles.total);
    await organization.locator('#route-workspace').screenshot({ path: screenshotPath('ruta-real.png') });
    await organization.locator('#route-workspace').screenshot({ path: screenshotPath('ruta-vista.png') });

    const request = await submitRequest(organization);
    evidence.registros_creados.push({ id_solicitud: request.id_solicitud, id_donacion: donation.id_donacion });
    await page.reload();
    await page.locator('.sidebar-nav [data-view="solicitudes"]').click();
    const donorRequest = page.locator('.mvp-request-card').filter({ hasText: donation.alimento });
    await expect(donorRequest).toHaveCount(1);
    await donorRequest.locator('[data-action="accept-request"]').click();
    await page.locator('#decision-form button[type="submit"]').click();
    await expect(page.locator('#app-dialog')).not.toBeVisible();
    await expect(page.locator('.mvp-request-card').filter({ hasText: donation.alimento }).locator('.status-aceptada')).toBeVisible();
    await organization.reload();
    await organization.locator('.sidebar-nav [data-view="solicitudes"]').click();
    await expect(organization.locator('.mvp-request-card').filter({ hasText: donation.alimento }).locator('.status-aceptada')).toBeVisible();
  } finally { await organizationContext.close(); }
  expect(evidence.errores_javascript).toEqual([]);
});

test('E2E real: editar donación, cancelar solicitud y cancelar publicación; modal con teclado', async ({ browser, page }) => {
  observe(page, 'donante-edicion');
  await login(page, 'donante');
  const donation = await createDonation(page, 'cancelacion');
  await page.locator('[data-action="edit"]').click();
  await page.locator('#donation-form [name="cantidad"]').fill('17');
  await page.locator('#donation-form [name="ubicacion_confirmada"]').check();
  await page.locator('#donation-form button[type="submit"]').click();
  await expect(page.locator('.detail-quantity')).toContainText('17');
  await page.reload();
  await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
  const card = page.locator('.mvp-donation-card').filter({ hasText: donation.alimento });
  await expect(card).toContainText('17');

  const organizationContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const organization = await organizationContext.newPage();
  observe(organization, 'organizacion-cancelacion');
  try {
    await login(organization, 'organizacion');
    await findDonation(organization, donation);
    const request = await submitRequest(organization);
    const requestCard = organization.locator('.mvp-request-card').filter({ hasText: donation.alimento });
    await requestCard.locator('[data-action="cancel-request"]').click();
    await organization.locator('#decision-form [name="motivo"]').fill('Cancelación mediante prueba UI automatizada.');
    await organization.locator('#decision-form button[type="submit"]').click();
    await expect(organization.locator('#app-dialog')).not.toBeVisible();
    await expect(organization.locator('.mvp-request-card').filter({ hasText: donation.alimento }).locator('.status-cancelada')).toBeVisible();
    evidence.cancelacion_solicitud = { id_solicitud: request.id_solicitud, estado: 'cancelada' };
  } finally { await organizationContext.close(); }

  await card.getByRole('button', { name: 'Ver detalles', exact: true }).click();
  const cancelButton = page.locator('[data-action="cancel-donation"]');
  await cancelButton.click();
  await expect(page.locator('#app-dialog')).toBeVisible();
  const focusSequence = [];
  for (let i = 0; i < 9; i += 1) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ inside: document.querySelector('#app-dialog').contains(document.activeElement), tag: document.activeElement.tagName }));
    focusSequence.push(focus);
    // Chrome puede llevar el foco a su interfaz (activeElement=BODY); el contenido de fondo permanece inerte.
    expect(focus.inside || focus.tag === 'BODY').toBe(true);
  }
  expect(focusSequence.some(item => item.inside)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await expect(cancelButton).toBeFocused();
  await cancelButton.click();
  await page.locator('#decision-form [name="motivo"]').fill('Publicación finalizada después de verificar edición y cancelación.');
  await page.locator('#decision-form button[type="submit"]').click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await expect(page.locator('.mvp-donation-card').filter({ hasText: donation.alimento }).locator('.status-cancelada')).toBeVisible();
  evidence.cancelacion_donacion = { id_donacion: donation.id_donacion, estado: 'cancelada', modal_teclado: true, secuencia_foco: focusSequence };
  expect(evidence.errores_javascript).toEqual([]);
});

test('Responsive real a 360 px: landing, login, menú y dashboard sin desbordamiento', async ({ page }) => {
  observe(page, 'movil');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const landing = await expectNoHorizontalScroll(page);
  await login(page, 'donante');
  const dashboard = await expectNoHorizontalScroll(page);
  await page.locator('[data-sidebar-open]').click();
  await expect(page.locator('#app-sidebar')).toHaveClass(/open/);
  await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/open/);
  await expect.poll(() => page.locator('#app-sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  const donations = await expectNoHorizontalScroll(page);
  await page.screenshot({ path: screenshotPath('mobile.png') });
  evidence.responsive = { ancho: 360, landing, dashboard, donaciones: donations };
  expect(evidence.errores_javascript).toEqual([]);
});

test('Seguridad UI: contenido almacenado se muestra como texto y no crea elementos ejecutables', async ({ page }) => {
  observe(page, 'marcado-almacenado');
  await login(page, 'donante');
  const donation = await createDonation(page, 'marcado');
  const payload = '<img src=x onerror="window.__uiXss=true">';
  const name = `${donation.alimento} ${payload}`;
  await page.evaluate(async ({ id, name, payload }) => {
    await REA.request(`/api/donaciones/${id}`, { method: 'PATCH', body: { alimento: name, categoria: payload } });
  }, { id: donation.id_donacion, name, payload });
  try {
    await page.reload();
    await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
    const card = page.locator('.mvp-donation-card').filter({ hasText: name });
    await card.getByRole('button', { name: 'Ver detalles', exact: true }).click();
    await expect(page.locator('#main-content h1')).toHaveText(name);
    await expect(page.locator('#main-content h1 img, .mvp-page-header p img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__uiXss === true)).toBe(false);
    evidence.marcado_almacenado = { id_donacion: donation.id_donacion, mostrado_como_texto: true, elementos_ejecutables: 0 };
  } finally {
    await page.evaluate(async id => {
      await REA.request(`/api/donaciones/${id}/cancelar`, { method: 'POST', body: { motivo: 'Cierre del registro propio de la prueba de escape de contenido.' } });
    }, donation.id_donacion);
  }
  expect(evidence.errores_javascript).toEqual([]);
});
