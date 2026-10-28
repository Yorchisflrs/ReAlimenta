import { test, expect } from '@playwright/test';
import { writeFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const run=process.env.REALIMENTA_UI_RUN_ID||Date.now().toString(36);
const evidence={fecha:new Date().toISOString(),ejecucion:run,proveedores_reales:true,pruebas:[],errores_javascript:[],registros:[],rutas:[]};
const output=new URL('../docs/evidencias/',import.meta.url);
const shot=name=>fileURLToPath(new URL(name,output));
async function login(page,role){
  await page.goto('/login.html');await page.locator(`[data-demo-account="${role}"]`).click();await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('.mvp-dashboard-grid')).toBeVisible();
}
async function navigate(page,view){
  const toggle=page.locator('[data-sidebar-open]');if(await toggle.isVisible())await toggle.click();
  await page.locator(`.sidebar-nav [data-view="${view}"]`).click();
}
function watch(page){page.on('pageerror',error=>evidence.errores_javascript.push(error.message));}
async function noOverflow(page){const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));expect(size.document,JSON.stringify(size)).toBeLessThanOrEqual(size.viewport+1);expect(size.body).toBeLessThanOrEqual(size.viewport+1);return size;}
async function tilesReady(page){await expect.poll(()=>page.locator('#custody-map .leaflet-tile').evaluateAll(images=>images.length>0&&images.every(image=>image.complete&&image.naturalWidth>0)),{timeout:30000}).toBe(true);}
async function fixture(page){
  const login=async name=>{
    const response=await page.request.post('/api/auth/login',{data:{correo:`${name}@realimenta.test`,contrasena:'Realimenta2026!'}});expect(response.ok()).toBeTruthy();return (await response.json()).csrfToken;
  };
  const csrf=await login('donante');
  const name=`Prueba UI ${run} cadena de custodia`;
  const payload={alimento:name,categoria:'Panadería',cantidad:30,unidad:'unidades',descripcion:'Registro propio de la prueba automatizada de custodia; ocultar al finalizar.',imagen_clave:'pan',perfil_alimento:'panaderia',fecha_disponibilidad:new Date(Date.now()-60000).toISOString(),fecha_limite_recojo:new Date(Date.now()+3600000).toISOString(),fecha_limite_aprovechamiento_declarada:new Date(Date.now()+70*60000).toISOString(),direccion_recojo:'Jr. Deustua, punto público de demostración en Puno',distrito:'Puno',latitud_recojo:-15.840908,longitud_recojo:-70.0289581,conservacion_declarada:'Envase protegido según declaración de prueba.',requiere_cadena_frio:false,envase:'Caja cerrada de prueba'};
  const created=await page.request.post('/api/donaciones',{headers:{'x-csrf-token':csrf},data:payload});expect(created.status()).toBe(201);const d=(await created.json()).data;
  const orgToken=await login('organizacion');
  const response=await page.request.post(`/api/donaciones/${d.id_donacion}/solicitudes`,{headers:{'x-csrf-token':orgToken},data:{responsable_recojo:'Conductor de prueba UI',telefono:'951000000',transporte_declarado:'Vehículo de demostración',recipiente_declarado:'Contenedor cerrado de prueba',dispone_cadena_frio:false,fecha_propuesta:new Date(Date.now()+5*60000).toISOString()}});expect(response.status()).toBe(201);const s=(await response.json()).data;
  const donorToken=await login('donante');
  expect((await page.request.post(`/api/solicitudes/${s.id_solicitud}/aceptar`,{headers:{'x-csrf-token':donorToken},data:{}})).status()).toBe(200);
  await page.goto('/donante.html#seguimiento');await expect(page.locator('.custody-layout')).toBeVisible();
  await page.locator('[data-custody-search]').fill(name);await page.locator('.custody-choice').filter({hasText:name}).click();await expect(page.locator('.custody-shipment h2')).toHaveText(name);
  const id=Number(await page.locator('[data-custody-action="event"]').getAttribute('data-id'));
  evidence.registros.push({id_donacion:d.id_donacion,id_solicitud:s.id_solicitud,id_seguimiento:id});
  return {...d,name,trackingId:id};
}
async function saveEvent(page,condition='sin_novedad'){
  await page.locator('[data-custody-action="event"]').click();const form=page.locator('#custody-event-form');await expect(form).toBeVisible();
  await form.locator('[name="condicion_declarada"]').selectOption(condition);await form.locator('[name="observacion"]').fill('Revisión manual declarada durante la prueba UI; envase documentado.');
  await form.locator('button[type="submit"]').click();await expect(page.locator('#app-dialog')).not.toBeVisible();
}
test.beforeAll(async()=>{await mkdir(output,{recursive:true});});
test.afterEach(async({},info)=>{evidence.pruebas.push({nombre:info.title,estado:info.status,duracion_ms:info.duration,error:info.error?.message||null});await writeFile(new URL('custodia-ui.json',output),JSON.stringify(evidence,null,2));});

test('Catálogo presentable: fotografías, direcciones y rutas sin publicaciones técnicas',async({page})=>{
  watch(page);await login(page,'organizacion');await navigate(page,'disponibles');
  await expect(page.locator('.mvp-donation-card')).toHaveCount(13);
  await expect(page.locator('[data-donation-results]')).not.toContainText('Prueba UI');
  await expect(page.locator('.card-address')).toHaveCount(13);await expect(page.locator('.food-visual img')).toHaveCount(13);
  await expect.poll(()=>page.locator('.food-visual img').evaluateAll(imgs=>imgs.slice(0,6).every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
  await expect(page.locator('.mvp-donation-card').filter({hasText:'Pan de molde'})).toContainText('km');
  await page.screenshot({path:shot('catalogo-mejorado.png')});evidence.catalogo={donaciones:13,imagenes:13,prueba_ui_visible:false};
  expect(evidence.errores_javascript).toEqual([]);
});

test('Seguimiento real: mapa por carretera, verde y rojo, escenario de tráfico y administración',async({page})=>{
  watch(page);await login(page,'admin');await navigate(page,'seguimiento');
  await expect(page.locator('#custody-map path.leaflet-interactive')).toHaveCount(1);
  await expect(page.locator('[data-custody-evaluation] .tone-verde')).toBeVisible();
  await tilesReady(page);await page.screenshot({path:shot('seguimiento-panel.png')});
  const options=page.locator('#custody-route-form');await options.locator('[name="demora_trafico_min"]').selectOption('45');
  const responsePromise=page.waitForResponse(r=>/\/api\/seguimiento\/\d+\/evaluacion$/.test(r.url())&&r.request().method()==='POST');await options.locator('button[type="submit"]').click();const response=await responsePromise;expect(response.ok()).toBeTruthy();const data=(await response.json()).data;
  expect(data.ruta.geometry.coordinates.length).toBeGreaterThan(2);expect(data.ruta.trafico_en_vivo).toBe(false);expect(data.evaluacion.duracion_con_escenario_min).toBeCloseTo(data.ruta.duracion_estimada_min+45);
  evidence.rutas.push({distancia:data.ruta.distancia_km,duracion:data.ruta.duracion_estimada_min,puntos:data.ruta.geometry.coordinates.length,demora:45,trafico_en_vivo:false});
  await expect(page.locator('[data-custody-comparison]')).toContainText('Base + 45 min');
  await options.locator('[name="demora_trafico_min"]').selectOption('0');await options.locator('button[type="submit"]').click();
  await expect(page.locator('[data-custody-comparison]')).toContainText('Base + 0 min');
  await page.locator('#custody-map').scrollIntoViewIfNeeded();await tilesReady(page);await page.screenshot({path:shot('seguimiento-mapa.png')});
  await page.locator('.custody-choice').filter({hasText:'Yogur envasado'}).click();await expect(page.locator('[data-custody-evaluation] .tone-rojo')).toBeVisible();await expect(page.locator('.custody-alerts')).toContainText('Medición de conservación pendiente');
  await navigate(page,'incidencias');await expect(page.locator('.incident-board')).toContainText('Medición de conservación pendiente');await expect(page.locator('[data-custody-action="resolve"]')).toBeVisible();
  await page.screenshot({path:shot('incidencias-mejorado.png')});expect(evidence.errores_javascript).toEqual([]);
});

test('Cadena de custodia completa en navegador: hitos, transferencia, incidencia y resolución',async({page})=>{
  watch(page);const d=await fixture(page);
  await expect(page.locator('[data-custody-evaluation] .tone-amarillo')).toBeVisible();
  await saveEvent(page);await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText('Listo para recojo');
  await saveEvent(page);await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText('Recojo registrado');
  await login(page,'organizacion');await navigate(page,'seguimiento');await page.locator('[data-custody-search]').fill(d.name);await page.locator('.custody-choice').click();
  await saveEvent(page);await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText('En traslado');
  await page.locator('.custody-event-actions [data-custody-action="incident"]').click();
  const incident=page.locator('#custody-incident-form');await incident.locator('[name="severidad"]').selectOption('alta');await incident.locator('[name="titulo"]').fill(`Demora UI ${run}`);await incident.locator('[name="descripcion"]').fill('Escenario de prueba: se detiene el vehículo y se solicita revisión.');await incident.locator('button[type="submit"]').click();await expect(page.locator('#app-dialog')).not.toBeVisible();
  await page.locator('[data-custody-search]').fill(d.name);await page.locator('.custody-choice').click();await expect(page.locator('[data-custody-evaluation] .tone-rojo')).toBeVisible();
  await login(page,'admin');await navigate(page,'incidencias');const card=page.locator('.custody-incident-card').filter({hasText:`Demora UI ${run}`});await card.locator('[data-custody-action="resolve"]').click();await page.locator('#custody-resolution-form [name="resolucion"]').fill('Prueba: responsable revisó la demora y coordinó la continuación. No es una validación sanitaria.');await page.locator('#custody-resolution-form button[type="submit"]').click();await expect(page.locator('#app-dialog')).not.toBeVisible();await expect(page.locator('.custody-incident-card').filter({hasText:`Demora UI ${run}`})).toContainText('Resuelta');
  await login(page,'organizacion');await navigate(page,'seguimiento');await page.locator('[data-custody-search]').fill(d.name);await page.locator('.custody-choice').click();
  await saveEvent(page);await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText('Entrega registrada');
  await saveEvent(page);await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText('Recepción confirmada');
  await page.reload();await expect(page.locator('.custody-layout')).toBeVisible();await page.locator('[data-custody-search]').fill(d.name);await page.locator('.custody-choice').click();await expect(page.locator('.custody-shipment-heading .custody-badge')).toHaveText('Recepción confirmada');await expect(page.locator('.custody-timeline li')).toHaveCount(6);
  expect(evidence.errores_javascript).toEqual([]);evidence.custodia={completa:true,hitos:6,incidencia_resuelta:true,persistencia_recarga:true};
});

test('Seguimiento móvil a 360 px: catálogo, mapa, incidencias y formularios accesibles',async({page})=>{
  watch(page);await page.setViewportSize({width:360,height:800});await login(page,'organizacion');await navigate(page,'disponibles');await noOverflow(page);await page.screenshot({path:shot('catalogo-movil.png')});
  await navigate(page,'seguimiento');await expect(page.locator('.custody-shipment')).toBeVisible();await noOverflow(page);await page.locator('#custody-map').scrollIntoViewIfNeeded();await tilesReady(page);await page.screenshot({path:shot('seguimiento-movil.png')});
  await page.locator('.custody-event-actions [data-custody-action="incident"]').click();await expect(page.locator('#app-dialog')).toBeVisible();await noOverflow(page);await page.keyboard.press('Escape');await expect(page.locator('#app-dialog')).not.toBeVisible();
  await navigate(page,'incidencias');await expect(page.locator('.incident-board')).toBeVisible();evidence.movil=await noOverflow(page);expect(evidence.errores_javascript).toEqual([]);
});
