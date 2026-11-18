import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Recorridos reales en Chrome. Se ejecutan con `npm run test:ui`, que levanta la aplicación sobre una base
// temporal: no escriben en la base `realimenta`.
const outputDirectory = process.env.UI_EVIDENCE_DIR
  ? pathToFileURL(`${path.resolve(process.env.UI_EVIDENCE_DIR)}${path.sep}`)
  : new URL('../docs/evidencias/', import.meta.url);
const screenshotPath = name => fileURLToPath(new URL(name, outputDirectory));
const photoFile = fileURLToPath(new URL('../assets/images/alimentos/pan.jpg', import.meta.url));
const runId = process.env.REALIMENTA_UI_RUN_ID || Date.now().toString(36);
const evidence = { fecha_inicio: new Date().toISOString(), ejecucion: runId, navegador: 'Google Chrome del sistema / Playwright', pruebas: [], registros_creados: [], errores_javascript: [], errores_consola: [] };

function observe(page, name) {
  page.on('pageerror', error => evidence.errores_javascript.push({ pagina: name, mensaje: error.message }));
  page.on('console', message => {
    if (message.type() === 'error' && !/tile\.openstreetmap|Failed to load resource/.test(message.text())) evidence.errores_consola.push({ pagina: name, mensaje: message.text() });
  });
}
async function saveEvidence() {
  await mkdir(outputDirectory, { recursive: true });
  const file = new URL('ui-resumen.json', outputDirectory);
  let previous = {};
  try { const saved = JSON.parse(await readFile(file, 'utf8')); if (saved.ejecucion === runId) previous = saved; } catch { /* Primera escritura de esta ejecución. */ }
  const merged = { ...previous, ...evidence, fecha_fin: new Date().toISOString() };
  for (const key of ['pruebas', 'registros_creados', 'errores_javascript', 'errores_consola'])
    merged[key] = [...new Map([...(previous[key] || []), ...evidence[key]].map(value => [JSON.stringify(value), value])).values()];
  await writeFile(file, JSON.stringify(merged, null, 2));
}
const limaInput = minutes => new Date(Date.now() + minutes * 60_000 - 5 * 3_600_000).toISOString().slice(0, 16);

async function login(page, role) {
  await page.goto('/login.html');
  await page.locator(`[data-demo-account="${role}"]`).click();
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${role === 'admin' ? 'administrador' : role}\\.html`));
  await expect(page.locator('[data-account-name]')).not.toHaveText(/Cargando|^$/);
}
const go = async (page, view) => { await page.locator(`.sidebar-nav [data-view="${view}"]`).click(); await expect(page.locator('.mvp-page-header')).toBeVisible(); };

// Publica por el formulario: datos, tres fotos, declaración de buen estado, vista previa y confirmación.
async function publishDonation(page, suffix) {
  const name = `Prueba UI ${runId} ${suffix}`;
  await go(page, 'nueva-donacion');
  const form = page.locator('#donation-form');
  await form.locator('[name="alimento"]').fill(name);
  await form.locator('[name="categoria"]').selectOption({ label: 'Panadería y complementos' });
  await form.locator('[name="estado_alimento_declarado"]').selectOption('sin_novedad');
  await form.locator('[name="cantidad"]').fill('12');
  await form.locator('[name="unidad"]').selectOption('unidades');
  await form.locator('[name="envase"]').fill('Bolsa cerrada de demostración');
  await form.locator('[name="fecha_disponibilidad"]').fill(limaInput(2));
  await form.locator('[name="fecha_limite_recojo"]').fill(limaInput(240));
  for (let i = 0; i < 3; i++) {
    await form.locator('.photo-slot-empty input').first().setInputFiles(photoFile);
    await expect(form.locator('.photo-slot.filled')).toHaveCount(i + 1);
  }
  await form.locator('[name="declaracion_buen_estado"]').check();
  await form.locator('[name="ubicacion_confirmada"]').check();
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#app-dialog [data-action="confirm-publish"]')).toBeVisible();
  const created = page.waitForResponse(r => r.url().endsWith('/api/donaciones') && r.request().method() === 'POST');
  const download = page.waitForEvent('download');
  await page.locator('#app-dialog [data-action="confirm-publish"]').click();
  const response = await created;
  const donation = (await response.json()).data;
  expect(response.status()).toBe(201);
  expect((await download).suggestedFilename()).toBe(`comprobante-donacion-${donation.id_donacion}.pdf`);
  await expect(page.locator('#main-content h1')).toHaveText(name);
  evidence.registros_creados.push({ id_donacion: donation.id_donacion, alimento: name });
  return { ...donation, alimento: name };
}
async function requestDonation(page, donation) {
  await go(page, 'disponibles');
  await page.locator('[data-filter="q"]').fill(donation.alimento);
  await page.locator('.mvp-donation-card').filter({ hasText: donation.alimento }).getByRole('button', { name: 'Ver detalles', exact: true }).click();
  await page.locator('[data-action="new-request"]').click();
  const form = page.locator('#request-form');
  await form.locator('[name="fecha_propuesta"]').fill(limaInput(45));
  await form.locator('[name="transporte_declarado"]').fill('Mototaxi de la entidad');
  await form.locator('[name="tiempo_llegada_min"]').fill('25');
  await form.locator('[name="recipiente_declarado"]').fill('Costales limpios');
  await form.locator('button[type="submit"]').click();
  const created = page.waitForResponse(r => /\/api\/donaciones\/\d+\/solicitudes$/.test(r.url()) && r.request().method() === 'POST');
  const download = page.waitForEvent('download');
  await page.locator('#app-dialog [data-action="confirm-request"]').click();
  const response = await created;
  expect(response.status()).toBe(201);
  await download;
  return (await response.json()).data;
}

test.afterEach(async ({}, info) => { evidence.pruebas.push({ nombre: info.title, estado: info.status, duracion_ms: info.duration, error: info.error?.message || null }); await saveEvidence(); });

test('Publicar con tres fotos y declaración, solicitar, aceptar y contactarse por teléfono o WhatsApp', async ({ browser, page }) => {
  observe(page, 'donante');
  await login(page, 'donante');
  const donation = await publishDonation(page, 'contacto');
  expect(donation.codigo_verificacion).toMatch(/^D\d+-[2-9A-Z]{4}$/);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const organization = await context.newPage();
  observe(organization, 'beneficiaria');
  try {
    await login(organization, 'organizacion');
    const request = await requestDonation(organization, donation);
    // El donante recibe el aviso en la campana sin recargar y acepta.
    await expect(page.locator('.notice-trigger [data-notice-count]')).not.toBeHidden({ timeout: 40_000 });
    await go(page, 'solicitudes');
    const card = page.locator('.mvp-request-card').filter({ hasText: donation.alimento });
    await expect(card).toContainText(request.codigo_verificacion);
    await card.locator('[data-action="accept-request"]').click();
    await page.locator('#decision-form button[type="submit"]').click();
    const contact = page.locator('.contact-card').first();
    await expect(contact).toContainText('QUIEN RECOGE');
    await expect(contact.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(contact.locator('a[href^="https://wa.me/51"]')).toHaveCount(1);
    await page.screenshot({ path: screenshotPath('recojo-contacto.png') });
    // La beneficiaria ve el teléfono del donante en su solicitud aceptada.
    await organization.reload(); await go(organization, 'solicitudes');
    await expect(organization.locator('.mvp-request-card').filter({ hasText: donation.alimento }).locator('.request-contact a[href^="tel:"]')).toHaveCount(1);
  } finally { await context.close(); }
  expect(evidence.errores_javascript).toEqual([]);
});

test('Recojo en pasos: listo, recogido y recibido con problemas; anular un recojo vuelve a publicar', async ({ browser, page }) => {
  observe(page, 'donante-recojo');
  await login(page, 'donante');
  const create = name => page.evaluate(async alimento => (await REA.request('/api/donaciones', { method: 'POST', body: { declaracion_buen_estado: true, alimento, categoria: 'Abarrotes y alimentos secos', cantidad: 10, unidad: 'kg', fecha_disponibilidad: new Date(Date.now() - 60000).toISOString(), fecha_limite_recojo: new Date(Date.now() + 5 * 3600000).toISOString(), direccion_recojo: 'Jr. Lima 450', distrito: 'Puno', latitud_recojo: -15.8402, longitud_recojo: -70.0278, conservacion_declarada: 'Temperatura ambiente', requiere_cadena_frio: false, envase: 'Bolsas cerradas' } })).data, name);
  const first = await create(`Arroz ${runId}`), second = await create(`Pan ${runId}`);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const organization = await context.newPage();
  observe(organization, 'beneficiaria-recojo');
  try {
    await login(organization, 'organizacion');
    for (const d of [first, second]) await organization.evaluate(async id => REA.request(`/api/donaciones/${id}/solicitudes`, { method: 'POST', body: { responsable_recojo: 'Rosa Quispe Mamani', telefono: '951234567', fecha_propuesta: new Date(Date.now() + 3600000).toISOString(), transporte_declarado: 'Mototaxi', recipiente_declarado: 'Costales', tiempo_llegada_min: 30, dispone_cadena_frio: false } }), d.id_donacion);
    for (const d of [first, second]) await page.evaluate(async id => { const [r] = (await REA.request(`/api/solicitudes?id_donacion=${id}`)).data; await REA.request(`/api/solicitudes/${r.id_solicitud}/aceptar`, { method: 'POST', body: {} }); }, d.id_donacion);
    // Donante: listo.
    await go(page, 'seguimiento');
    await page.locator('.custody-choice').filter({ hasText: first.alimento }).click();
    await expect(page.locator('.simple-stepper > div')).toHaveCount(4);
    await page.locator('[data-custody-action="step"][data-id="listo"]').click();
    await page.locator('#custody-event-form button[type="submit"]').click();
    await expect(page.locator('.simple-stepper > div.done').filter({ hasText: 'Listo' })).toHaveCount(1);
    // Beneficiaria: recogido y recibido con problemas (se crea una incidencia).
    await go(organization, 'seguimiento');
    await organization.locator('.custody-choice').filter({ hasText: first.alimento }).click();
    await organization.locator('[data-custody-action="step"][data-id="recogido"]').click();
    await organization.locator('#custody-event-form button[type="submit"]').click();
    await organization.locator('[data-custody-action="step"][data-id="con_problemas"]').click();
    await organization.locator('#custody-event-form [name="observacion"]').fill('Faltaban dos bolsas de arroz.');
    await organization.locator('#custody-event-form button[type="submit"]').click();
    await expect(organization.locator('.custody-alerts')).toContainText('Recibida con problemas');
    // Segunda donación: la beneficiaria avisa que no podrá recogerla y vuelve a publicarse.
    await organization.locator('.custody-choice').filter({ hasText: second.alimento }).click();
    await organization.locator('[data-custody-action="release"]').click();
    await organization.locator('#custody-release-form [name="motivo"]').fill('Se malogró nuestra movilidad.');
    await organization.locator('#custody-release-form button[type="submit"]').click();
    await expect(organization.locator('.mvp-toast').filter({ hasText: 'volvió a publicarse' })).toBeVisible();
    expect(await page.evaluate(async id => (await REA.request(`/api/donaciones/${id}`)).data.estado, second.id_donacion)).toBe('disponible');
  } finally { await context.close(); }
  expect(evidence.errores_javascript).toEqual([]);
});

test('Editar donación, cancelar solicitud y cancelar publicación; ventana manejable con teclado', async ({ browser, page }) => {
  observe(page, 'donante-edicion');
  await login(page, 'donante');
  const donation = await publishDonation(page, 'cancelacion');
  await page.locator('[data-action="edit"]').first().click();
  await page.locator('#donation-form [name="cantidad"]').fill('17');
  await page.locator('#donation-form [name="ubicacion_confirmada"]').check();
  await page.locator('#donation-form button[type="submit"]').click();
  const download = page.waitForEvent('download');
  await page.locator('#app-dialog [data-action="confirm-publish"]').click();
  await download;
  await expect(page.locator('.detail-quantity')).toContainText('17');
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const organization = await context.newPage();
  observe(organization, 'beneficiaria-cancelacion');
  try {
    await login(organization, 'organizacion');
    await requestDonation(organization, donation);
    await go(organization, 'solicitudes');
    const card = organization.locator('.mvp-request-card').filter({ hasText: donation.alimento });
    await card.locator('[data-action="cancel-request"]').click();
    await organization.locator('#decision-form [name="motivo"]').fill('Ya conseguimos este alimento.');
    await organization.locator('#decision-form button[type="submit"]').click();
    await expect(organization.locator('.mvp-request-card').filter({ hasText: donation.alimento }).locator('.status-cancelada')).toBeVisible();
  } finally { await context.close(); }
  await go(page, 'mis-donaciones');
  await page.locator('.mvp-donation-card').filter({ hasText: donation.alimento }).getByRole('button', { name: 'Ver detalles', exact: true }).click();
  const cancelButton = page.locator('[data-action="cancel-donation"]');
  await cancelButton.click();
  await expect(page.locator('#app-dialog')).toBeVisible();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ inside: document.querySelector('#app-dialog').contains(document.activeElement), tag: document.activeElement.tagName }));
    expect(focus.inside || focus.tag === 'BODY').toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await expect(cancelButton).toBeFocused();
  await cancelButton.click();
  await page.locator('#decision-form [name="motivo"]').fill('Publicación cerrada después de la prueba.');
  await page.locator('#decision-form button[type="submit"]').click();
  await expect(page.locator('.mvp-donation-card').filter({ hasText: donation.alimento }).locator('.status-cancelada')).toBeVisible();
  expect(evidence.errores_javascript).toEqual([]);
});

test('Responsive a 360 px: portada, ingreso, menú, panel y recojo sin desbordamiento', async ({ page }) => {
  observe(page, 'movil');
  await page.setViewportSize({ width: 360, height: 800 });
  const noOverflow = async () => {
    const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(size.document, JSON.stringify(size)).toBeLessThanOrEqual(size.viewport + 1);
    expect(size.body, JSON.stringify(size)).toBeLessThanOrEqual(size.viewport + 1);
  };
  await page.goto('/'); await noOverflow();
  await login(page, 'donante'); await noOverflow();
  await page.locator('[data-sidebar-open]').click();
  await expect(page.locator('#app-sidebar')).toHaveClass(/open/);
  await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/open/);
  await noOverflow();
  for (const view of ['seguimiento', 'notificaciones', 'consulta']) {
    await page.locator('[data-sidebar-open]').click();
    await page.locator(`.sidebar-nav [data-view="${view}"]`).click();
    await expect(page.locator('.mvp-page-header')).toBeVisible();
    await noOverflow();
  }
  await page.screenshot({ path: screenshotPath('mobile.png') });
  expect(evidence.errores_javascript).toEqual([]);
});

test('Seguridad UI: el marcado se rechaza y los textos con comillas se muestran tal cual', async ({ page }) => {
  observe(page, 'texto-seguro');
  await login(page, 'donante');
  const name = `Pan "casero" & queso 'andino' ${runId}`;
  const result = await page.evaluate(async ({ name }) => {
    const base = { declaracion_buen_estado: true, categoria: 'Panadería y complementos', cantidad: 5, unidad: 'unidades', fecha_disponibilidad: new Date(Date.now() - 60000).toISOString(), fecha_limite_recojo: new Date(Date.now() + 3 * 3600000).toISOString(), direccion_recojo: 'Jr. Lima 450', distrito: 'Puno', latitud_recojo: -15.8402, longitud_recojo: -70.0278, conservacion_declarada: 'Temperatura ambiente', requiere_cadena_frio: false, envase: 'Bolsa cerrada' };
    let rejected = null;
    try { await REA.request('/api/donaciones', { method: 'POST', body: { ...base, alimento: '<img src=x onerror="window.__uiXss=true">' } }); } catch (error) { rejected = error.status; }
    const created = (await REA.request('/api/donaciones', { method: 'POST', body: { ...base, alimento: name } })).data;
    return { rejected, id: created.id_donacion };
  }, { name });
  expect(result.rejected).toBe(422);
  await page.reload();
  await go(page, 'mis-donaciones');
  await page.locator('.mvp-donation-card').filter({ hasText: name }).getByRole('button', { name: 'Ver detalles', exact: true }).click();
  await expect(page.locator('#main-content h1')).toHaveText(name);
  await expect(page.locator('#main-content h1 *')).toHaveCount(0);
  expect(await page.evaluate(() => window.__uiXss === true)).toBe(false);
  expect(evidence.errores_javascript).toEqual([]);
});
