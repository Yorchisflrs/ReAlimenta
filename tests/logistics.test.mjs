import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startSandbox } from './helpers/mysql-sandbox.mjs';

let sandbox, pool, db, appServer, provider, base, evaluate, calculate, providerDown=false;
const accounts = {};
async function call(method, route, body, account) {
  const response = await fetch(base + route, { method, headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(account ? { Cookie: account.cookie, 'x-csrf-token': account.csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json(), response };
}
before(async () => {
  sandbox = await startSandbox();
  provider = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (providerDown) { res.statusCode=503;res.end('{}');return; }
    res.end(JSON.stringify({code:'Ok', routes:[{distance:4000,duration:600,geometry:{type:'LineString',coordinates:[[-70.028,-15.84],[-70.02,-15.83]]}}]}));
  }).listen(0,'127.0.0.1');
  await new Promise(resolve => provider.once('listening',resolve));
  process.env.OSRM_URL = `http://127.0.0.1:${provider.address().port}`;
  await promisify(execFile)(process.execPath, ['scripts/seed.mjs'], {env:{...process.env}});
  ({db,pool} = await import('../server/db.js'));
  ({evaluateLogistics:evaluate,calculateRoute:calculate} = await import('../server/logistics.js'));
  const {createApp} = await import('../server/app.js');
  appServer=createApp().listen(0,'127.0.0.1'); await new Promise(resolve=>appServer.once('listening',resolve));
  base=`http://127.0.0.1:${appServer.address().port}`;
  for (const who of ['donante','organizacion','organizacion2','admin']) {
    const r=await call('POST','/api/auth/login',{correo:`${who}@realimenta.test`,contrasena:'Realimenta2026!'});
    assert.equal(r.status,200); accounts[who]={cookie:r.response.headers.get('set-cookie').split(';')[0],csrf:r.data.csrfToken};
  }
});

test('Si el proveedor de mapas falla no se inventa una ruta', async()=>{
  providerDown=true;
  try { await assert.rejects(calculate({latitud:-15.81,longitud:-70.01},{latitud:-15.82,longitud:-70.02}),error=>error.status===502); }
  finally {providerDown=false;}
});
after(async () => { if(appServer)await new Promise(r=>appServer.close(r)); if(provider)await new Promise(r=>provider.close(r)); await pool?.end(); await sandbox?.stop(); });

test('El semáforo compara límites, recorrido, cadena de frío y condiciones declaradas', () => {
  const now = new Date('2026-11-18T12:00:00Z'), afterMin = n => new Date(now.getTime()+n*60000).toISOString();
  const journey={ida:{duracion_min:10},vuelta:{duracion_min:20}};
  const donation={fecha_disponibilidad:afterMin(-10),fecha_limite_recojo:afterMin(100),fecha_limite_aprovechamiento_declarada:afterMin(120),requiere_cadena_frio:false};
  assert.equal(evaluate(donation,journey,{},now).color,'verde');
  assert.equal(evaluate({...donation,fecha_limite_aprovechamiento_declarada:afterMin(60)},journey,{},now).color,'amarillo');
  assert.equal(evaluate({...donation,fecha_limite_aprovechamiento_declarada:afterMin(35)},journey,{},now).color,'rojo');
  assert.equal(evaluate({...donation,fecha_limite_aprovechamiento_declarada:null},journey,{},now).color,'gris');
  assert.equal(evaluate({...donation,requiere_cadena_frio:true},journey,{},now).color,'gris');
  assert.equal(evaluate({...donation,requiere_cadena_frio:true},journey,{dispone_cadena_frio:false},now).color,'rojo');
  assert.equal(evaluate(donation,journey,{condicion:'no_conforme'},now).color,'rojo');
  assert.equal(evaluate({...donation,fecha_vencimiento:afterMin(30)},journey,{},now).color,'rojo');
  assert.equal(evaluate(donation,journey,{demora_trafico_min:90},now).color,'rojo');
  assert.equal(evaluate(donation,journey,{fecha_propuesta:afterMin(60)},now).tiempo_total_min,90);
  assert.throws(()=>evaluate(donation,journey,{demora_trafico_min:-1},now),/0 y 180/);
});

test('Ruta: accesos, trayectos reales del proveedor y persistencia de la evaluación', async () => {
  const now=Date.now();
  const d=await call('POST','/api/donaciones',{alimento:'Pan artesanal de prueba',categoria:'Panadería y complementos',cantidad:30,unidad:'unidades',fecha_disponibilidad:new Date(now-60000).toISOString(),fecha_limite_recojo:new Date(now+3*3600000).toISOString(),fecha_limite_aprovechamiento_declarada:new Date(now+5*3600000).toISOString(),direccion_recojo:'Punto de prueba en Puno',distrito:'Puno',latitud_recojo:-15.84,longitud_recojo:-70.028,conservacion_declarada:'Temperatura ambiente',requiere_cadena_frio:false,envase:'Bolsa cerrada',declaracion_buen_estado:true},accounts.donante);
  assert.equal(d.status,201); const id=d.data.data.id_donacion, path=`/api/donaciones/${id}/evaluacion-ruta`;
  assert.equal((await call('POST',path,{})).status,401);
  assert.equal((await call('POST',path,{},accounts.donante)).status,403);
  assert.equal((await call('POST',path,{demora_trafico_min:181},accounts.organizacion)).status,422);
  const result=await call('POST',path,{demora_trafico_min:15},accounts.organizacion);
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.data.vuelta.distancia_km,4); assert.equal(result.data.data.evaluacion.tiempo_total_min,45);
  assert.equal(result.data.data.evaluacion.color,'verde'); assert.equal(result.data.data.evaluacion.trafico_en_vivo,false);
  assert.equal(result.data.data.vuelta.geometria.type,'LineString');
  const rows=(await db.query('SELECT * FROM evaluaciones_ruta WHERE id_evaluacion = ?',[result.data.data.id_evaluacion])).rows;
  assert.equal(rows.length,1); assert.equal(rows[0].id_donacion,id); assert.equal(rows[0].semaforo,'verde');
  const request=await call('POST',`/api/donaciones/${id}/solicitudes`,{responsable_recojo:'Persona de prueba',telefono:'951000000',transporte_declarado:'Mototaxi',recipiente_declarado:'Caja',dispone_cadena_frio:false,fecha_propuesta:new Date(now+30*60000).toISOString(),tiempo_llegada_min:20},accounts.organizacion);
  assert.equal(request.status,201,JSON.stringify(request.data));
  const accepted=await call('POST',`/api/solicitudes/${request.data.data.id_solicitud}/aceptar`,{},accounts.donante);
  assert.equal(accepted.status,200,JSON.stringify(accepted.data));
  const trackingPath=`/api/seguimiento/${accepted.data.data.id_seguimiento}/evaluacion-ruta`;
  assert.equal((await call('POST',trackingPath,{},accounts.organizacion2)).status,403);
  const tracking=await call('POST',trackingPath,{demora_trafico_min:15},accounts.donante);
  assert.equal(tracking.status,200,JSON.stringify(tracking.data));
  const stored=(await db.query('SELECT id_solicitud FROM evaluaciones_ruta WHERE id_evaluacion = ?',[tracking.data.data.id_evaluacion])).rows[0];
  assert.equal(stored.id_solicitud,request.data.data.id_solicitud);
});
