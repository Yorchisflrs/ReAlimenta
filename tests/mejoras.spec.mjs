import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const photo=fileURLToPath(new URL('../assets/images/alimentos/pan.jpg',import.meta.url));
const limaInput=minutes=>new Date(Date.now()+minutes*60000-5*3600000).toISOString().slice(0,16);
async function login(page, role) {
  await page.goto('/login.html');await page.locator(`[data-demo-account="${role}"]`).click();
  await page.locator('#login-form button[type="submit"]').click();await expect(page.locator('.mvp-dashboard-grid')).toBeVisible();
}
async function pdf(page, selector, expected) {
  const event=page.waitForEvent('download');await page.locator(selector).click();const download=await event;
  expect(download.suggestedFilename()).toMatch(expected);expect(await download.failure()).toBeNull();
}

test('Cinco fotos, vista previa y borradores; ruta, solicitud, seguimiento y comprobante de administración',async({browser,page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const food=`Pan artesanal prueba ${Date.now()}`;
  await login(page,'donante');await page.locator('.sidebar-nav [data-view="nueva-donacion"]').click();
  const f=page.locator('#donation-form');await f.locator('[name="alimento"]').fill(food);
  await f.locator('[name="categoria"]').selectOption({label:'Panadería y complementos'});
  await f.locator('[name="estado_alimento_declarado"]').selectOption('sin_novedad');
  await f.locator('[name="cantidad"]').fill('20');await f.locator('[name="envase"]').fill('Bolsas cerradas');
  await f.locator('[name="fecha_disponibilidad"]').fill(limaInput(2));await f.locator('[name="fecha_limite_recojo"]').fill(limaInput(240));
  await f.locator('[name="fecha_limite_aprovechamiento_declarada"]').fill(limaInput(480));await f.locator('[name="fecha_vencimiento"]').fill(limaInput(600));
  for(let i=0;i<5;i++)await f.locator('.photo-slot-empty input').first().setInputFiles(photo);
  await expect(f.locator('.photo-slot.filled')).toHaveCount(5);await f.locator('[name="declaracion_buen_estado"]').check();await f.locator('[name="ubicacion_confirmada"]').check();
  await f.locator('button[type="submit"]').click();
  const dialog=page.locator('#app-dialog');await expect(dialog.locator('.rp-offer-card')).toContainText(food);await expect(dialog.locator('.rp-photos figure')).toHaveCount(5);
  await pdf(page,'#app-dialog [data-action="draft-donation"]',/^borrador-donacion\.pdf$/);
  const created=page.waitForResponse(r=>r.url().endsWith('/api/donaciones')&&r.request().method()==='POST');
  const publishedPdf=page.waitForEvent('download');await dialog.locator('[data-action="confirm-publish"]').click();
  const donation=await (await created).json();await publishedPdf;
  await expect(page.locator('#main-content h1')).toHaveText(food);
  const saved=await (await page.request.get(`/api/donaciones/${donation.data.id_donacion}`)).json();expect(saved.data.fotos).toHaveLength(5);

  const context=await browser.newContext({baseURL:test.info().project.use.baseURL});const org=await context.newPage();
  org.on('pageerror',error=>errors.push(error.message));
  try {
    await login(org,'organizacion');await org.locator('.sidebar-nav [data-view="disponibles"]').click();
    await org.locator('[data-filter="q"]').fill(food);await org.locator('.mvp-donation-card').filter({hasText:food}).getByRole('button',{name:'Ver detalles',exact:true}).click();
    const routeData={id_evaluacion:1,ida:{duracion_min:12,distancia_km:3},vuelta:{duracion_min:10,distancia_km:3.2,geometria:{type:'LineString',coordinates:[[-70.028,-15.84],[-70.02,-15.83]]}},evaluacion:{color:'verde',mensaje:'Hay margen de tiempo.',avisos:[],demora_trafico_min:15,espera_min:0,recojo_min:10,tiempo_total_min:47,tiempo_disponible_min:200}};
    await org.route('**/api/donaciones/*/evaluacion-ruta',r=>r.fulfill({json:{data:routeData}}));
    await org.locator('[data-calculate-route]').click();await expect(org.locator('[data-route-result]')).toContainText('Con margen de tiempo');
    await org.locator('[data-action="new-request"]').click();const rf=org.locator('#request-form');
    await expect(rf.locator('[name="tiempo_llegada_min"]')).toHaveValue('12');
    await rf.locator('[name="telefono"]').fill('951234567');await rf.locator('[name="telefono"]').pressSequentially('ab123');await expect(rf.locator('[name="telefono"]')).toHaveValue('951234567');
    await rf.locator('[name="fecha_propuesta"]').fill(limaInput(45));await rf.locator('[name="transporte_declarado"]').fill('Mototaxi');await rf.locator('[name="recipiente_declarado"]').fill('Caja cerrada');
    await rf.locator('button[type="submit"]').click();await pdf(org,'#app-dialog [data-action="draft-request"]',/^borrador-solicitud\.pdf$/);
    const sent=org.waitForResponse(r=>/\/api\/donaciones\/\d+\/solicitudes$/.test(r.url())&&r.request().method()==='POST');const receipt=org.waitForEvent('download');
    await org.locator('#app-dialog [data-action="confirm-request"]').click();expect((await sent).status()).toBe(201);await receipt;
    await page.locator('.sidebar-nav [data-view="solicitudes"]').click();const card=page.locator('.mvp-request-card').filter({hasText:food});
    await card.locator('[data-action="accept-request"]').click();await page.locator('#decision-form button[type="submit"]').click();
    await expect(page.locator('[data-custody-detail]')).toContainText(food);
    await page.route('**/api/seguimiento/*/evaluacion-ruta',r=>r.fulfill({json:{data:routeData}}));
    await page.locator('[data-calculate-route]').click();await expect(page.locator('[data-route-result]')).toContainText('Con margen de tiempo');
    const admin=await context.newPage();await login(admin,'admin');await admin.locator('.sidebar-nav [data-view="solicitudes"]').click();
    const adminCard=admin.locator('.mvp-request-card').filter({hasText:food});await expect(adminCard).toBeVisible();
    const adminDownload=admin.waitForEvent('download');await adminCard.locator('[data-action="request-receipt"]').click();
    expect((await adminDownload).suggestedFilename()).toMatch(/^comprobante-solicitud-\d+\.pdf$/);
  } finally {await context.close();}
  expect(errors).toEqual([]);
});

test('Si falla una foto, el borrador privado se recupera sin crear otra donación',async({page})=>{
  await login(page,'donante');await page.locator('.sidebar-nav [data-view="nueva-donacion"]').click();
  const food=`Borrador de prueba ${Date.now()}`, form=page.locator('#donation-form');
  await form.locator('[name="alimento"]').fill(food);await form.locator('[name="categoria"]').selectOption({label:'Panadería y complementos'});
  await form.locator('[name="estado_alimento_declarado"]').selectOption('sin_novedad');await form.locator('[name="cantidad"]').fill('10');
  await form.locator('[name="envase"]').fill('Caja cerrada');await form.locator('[name="fecha_disponibilidad"]').fill(limaInput(2));
  await form.locator('[name="fecha_limite_recojo"]').fill(limaInput(240));await form.locator('[name="ubicacion_confirmada"]').check();
  for(let i=0;i<3;i++)await form.locator('.photo-slot-empty input').first().setInputFiles(photo);
  await form.locator('[name="declaracion_buen_estado"]').check();await form.locator('button[type="submit"]').click();
  await page.route('**/api/donaciones/*/foto',r=>r.fulfill({status:422,json:{error:{message:'Fallo de foto simulado'}}}));
  const created=page.waitForResponse(r=>r.url().endsWith('/api/donaciones')&&r.request().method()==='POST');
  await page.locator('#app-dialog [data-action="confirm-publish"]').click();const original=(await (await created).json()).data;
  expect(original.borrador).toBe(true);await expect(form.locator('[data-form-error]')).toContainText('borrador privado');
  await page.unroute('**/api/donaciones/*/foto');await page.reload();await page.locator('.sidebar-nav [data-view="mis-donaciones"]').click();
  const card=page.locator('.mvp-donation-card').filter({hasText:food});await expect(card).toContainText('Borrador');
  await card.locator('[data-action="detail"]').click();await expect(page.locator('.detail-summary')).toContainText('no aparece en el catálogo');
  await pdf(page,'[data-action="download-receipt"]',/^borrador-donacion\.pdf$/);
  await page.locator('.detail-summary [data-action="edit"]').click();
  const edit=page.locator('#donation-form');for(let i=0;i<3;i++)await edit.locator('.photo-slot-empty input').first().setInputFiles(photo);
  await edit.locator('button[type="submit"]').click();const published=page.waitForResponse(r=>r.url().endsWith(`/api/donaciones/${original.id_donacion}/publicar`)&&r.request().method()==='POST');
  const receipt=page.waitForEvent('download');await page.locator('#app-dialog [data-action="confirm-publish"]').click();expect((await published).status()).toBe(200);await receipt;
  const result=await (await page.request.get(`/api/donaciones/${original.id_donacion}`)).json();expect(result.data.borrador).toBe(false);expect(result.data.fotos).toHaveLength(3);
});
