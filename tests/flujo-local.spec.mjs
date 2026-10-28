import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run=process.env.REALIMENTA_UI_RUN_ID||Date.now().toString(36);
const evidenceDir=path.resolve(process.env.UI_EVIDENCE_DIR||'docs/evidencias/flujo-local');
const evidence={ejecucion:run,proveedor_real:true,errores_javascript:[]};
const limaInput=min=>new Date(Date.now()+min*60000-5*3600000).toISOString().slice(0,16);

async function login(page,role){
  await page.goto('/login.html');
  await page.locator(`[data-demo-account="${role}"]`).click();
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('.mvp-dashboard-grid')).toBeVisible();
}
async function navigate(page,view){
  const menu=page.locator('[data-sidebar-open]');if(await menu.isVisible())await menu.click();
  await page.locator(`.sidebar-nav [data-view="${view}"]`).click();
}
async function milestone(page,status){
  await page.locator('[data-custody-action="event"]').click();
  const form=page.locator('#custody-event-form');
  await form.locator('[name="condicion_declarada"]').selectOption('sin_novedad');
  await form.locator('[name="observacion"]').fill('Registro manual de prueba aislada: responsables y envase documentados.');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();
  await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText(status);
}
async function tilesReady(page){
  await expect.poll(()=>page.locator('#custody-map .leaflet-tile').evaluateAll(images=>images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0)),{timeout:30000}).toBe(true);
}

test('Flujo local completo: publicar 60 panes con foto, solicitar, aceptar, ruta de ida, tráfico persistente y recepción',async({page})=>{
  await mkdir(evidenceDir,{recursive:true});
  page.on('pageerror',error=>evidence.errores_javascript.push(error.message));
  const food=`Pan artesanal local · Prueba UI ${run}`;
  await login(page,'donante');await navigate(page,'nueva-donacion');
  const form=page.locator('#donation-form');
  await form.locator('[name="alimento"]').fill(food);
  await form.locator('[name="categoria"]').selectOption({label:'Panadería'});
  await form.locator('[name="cantidad"]').fill('60');
  await form.locator('[name="envase"]').fill('Bolsas de papel cerradas dentro de caja limpia');
  await form.locator('[name="perfil_alimento"]').selectOption('panaderia');
  await form.locator('[name="fecha_disponibilidad"]').fill(limaInput(-1));
  await form.locator('[name="fecha_limite_recojo"]').fill(limaInput(240));
  await form.locator('[name="fecha_limite_aprovechamiento_declarada"]').fill(limaInput(480));
  await form.locator('[name="direccion_recojo"]').fill('Jr. Deustua, Puno · punto público de demostración');
  await form.locator('[name="ubicacion_confirmada"]').check();
  await form.locator('[name="foto"]').setInputFiles(fileURLToPath(new URL('../assets/images/fondos/pan-queso-local-v2.png',import.meta.url)));
  const createdPromise=page.waitForResponse(r=>/\/api\/donaciones$/.test(r.url())&&r.request().method()==='POST');
  await form.locator('button[type="submit"]').click();
  const created=await createdPromise;expect(created.status()).toBe(201);
  evidence.id_donacion=(await created.json()).data.id_donacion;
  await expect(page.locator('#main-content h1')).toHaveText(food);

  await login(page,'organizacion');await navigate(page,'disponibles');
  const card=page.locator('.mvp-donation-card').filter({hasText:food});
  await expect(card).toContainText('60');
  await card.locator('[data-action="detail"]').click();
  await expect(page.locator('#route-evaluation [data-journey-leg="recojo"]')).toContainText('km',{timeout:35000});
  await expect(page.locator('#delivery-map path.leaflet-interactive')).toHaveCount(1);
  await page.locator('[data-action="new-request"]').click();
  const request=page.locator('#request-form');
  await request.locator('[name="responsable_recojo"]').fill('Responsable de organización en prueba');
  await request.locator('[name="telefono"]').fill('951000000');
  await request.locator('[name="fecha_propuesta"]').fill(limaInput(5));
  await request.locator('[name="transporte_declarado"]').fill('Vehículo para recojo y traslado');
  await request.locator('[name="recipiente_declarado"]').fill('Caja limpia con tapa');
  await request.locator('button[type="submit"]').click();
  await expect(page.locator('#app-dialog')).not.toBeVisible();

  await login(page,'donante');await navigate(page,'solicitudes');
  await page.locator('.mvp-request-card').filter({hasText:food}).locator('[data-action="accept-request"]').click();
  await page.locator('#decision-form button[type="submit"]').click();
  // La aceptación abre directamente la entrega correcta, sin buscarla manualmente en otro módulo.
  await expect(page.locator('.custody-shipment h2')).toHaveText(food);
  await expect(page.locator('[data-custody-comparison] [data-journey-leg="recojo"]')).toContainText('km',{timeout:35000});
  const planning=page.locator('#custody-route-form');
  await planning.locator('[name="demora_trafico_min"]').selectOption('45');
  await planning.locator('[name="margen_seguridad_min"]').fill('19');
  const planPromise=page.waitForResponse(r=>/\/api\/seguimiento\/\d+\/evaluacion$/.test(r.url())&&r.request().method()==='POST');
  await planning.locator('button[type="submit"]').click();
  const response=await planPromise;expect(response.status()).toBe(200);
  const plan=(await response.json()).data;
  expect(plan.ruta.geometry.coordinates.length).toBeGreaterThan(2);
  expect(plan.ruta_recojo.geometry.coordinates.length).toBeGreaterThan(2);
  expect(plan.evaluacion.viaje_recojo_min).toBeGreaterThan(0);
  expect(plan.evaluacion.demora_trafico_min).toBe(45);
  evidence.rutas={ida_km:plan.ruta_recojo.distancia_km,ida_min:plan.ruta_recojo.duracion_estimada_min,traslado_km:plan.ruta.distancia_km,traslado_min:plan.ruta.duracion_estimada_min,demora_min:45,trafico_en_vivo:false};
  await page.reload();
  await expect(page.locator('.custody-shipment h2')).toHaveText(food);
  await expect(page.locator('#custody-route-form [name="demora_trafico_min"]')).toHaveValue('45');
  await expect(page.locator('#custody-route-form [name="margen_seguridad_min"]')).toHaveValue('19');
  await expect(page.locator('[data-custody-comparison]')).toContainText('Base + 45 min');
  await expect(page.locator('.custody-condition .photo-referential-label')).toContainText('compartida por el donante');
  await tilesReady(page);
  await page.screenshot({path:path.join(evidenceDir,'seguimiento-local.png')});
  await milestone(page,'Listo para recojo');

  await login(page,'organizacion');await navigate(page,'solicitudes');
  const accepted=page.locator('.mvp-request-card').filter({hasText:food});
  await accepted.locator('[data-presentation-tracking]').click();
  await expect(page.locator('.custody-shipment h2')).toHaveText(food);
  await milestone(page,'Recojo registrado');
  await expect(page.locator('[data-custody-comparison] [data-journey-leg="recojo"]')).toContainText('Recojo ya registrado');
  await milestone(page,'En traslado');
  await milestone(page,'Entrega registrada');
  await milestone(page,'Recepción confirmada');
  await page.reload();
  await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText('Recepción confirmada');
  await expect(page.locator('.custody-timeline li')).toHaveCount(6);
  await page.setViewportSize({width:360,height:800});
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  expect(size.scroll).toBeLessThanOrEqual(size.width+1);
  await page.locator('#custody-map').scrollIntoViewIfNeeded();
  await tilesReady(page);
  await page.screenshot({path:path.join(evidenceDir,'seguimiento-local-movil.png')});
  expect(evidence.errores_javascript).toEqual([]);
  evidence.recepcion_confirmada=true;evidence.hitos=6;evidence.parametros_persistentes=true;
  await writeFile(path.join(evidenceDir,'flujo-local.json'),JSON.stringify(evidence,null,2));
});
