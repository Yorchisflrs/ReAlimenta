import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { promisify } from 'node:util';
import { startSandbox, SANDBOX_DATABASE } from './helpers/mysql-sandbox.mjs';

const execute = promisify(execFile);
let sandbox, db, pool, server, baseUrl, createApp;
const accounts = {};
const password = 'Realimenta2026!';
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (sql, params = []) => (await db.query(sql, params)).rows;

async function listen() {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}
async function call(method, path, body, account, extraHeaders = {}) {
  const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(account ? { Cookie: account.cookie, 'x-csrf-token': account.csrfToken } : {}), ...extraHeaders };
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data, response };
}
async function login(name) {
  const result = await call('POST', '/api/auth/login', { correo: `${name}@realimenta.test`, contrasena: password });
  assert.equal(result.status, 200);
  return { cookie: result.response.headers.get('set-cookie').split(';')[0], csrfToken: result.data.csrfToken, user: result.data.user };
}
function donation(overrides = {}) {
  return { alimento: 'Pan integral de prueba', categoria: 'Panadería', cantidad: 30, unidad: 'unidades', descripcion: 'Registro de prueba automatizada en base aislada.', fecha_disponibilidad: new Date(Date.now() - 60000).toISOString(), fecha_limite_recojo: new Date(Date.now() + 4 * 3600000).toISOString(), fecha_limite_aprovechamiento_declarada: new Date(Date.now() + 7 * 3600000).toISOString(), direccion_recojo: 'Punto público de prueba en Puno', distrito: 'Puno', latitud_recojo: -15.8402, longitud_recojo: -70.0278, conservacion_declarada: 'Temperatura ambiente', requiere_cadena_frio: false, envase: 'Caja de prueba', ...overrides };
}
async function createDonation(overrides = {}) {
  const result = await call('POST', '/api/donaciones', donation(overrides), accounts.donante);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.data;
}
function request(overrides = {}) {
  return { responsable_recojo: 'Responsable de prueba', telefono: '000000000', transporte_declarado: 'Vehículo de prueba', recipiente_declarado: 'Caja de prueba', dispone_cadena_frio: false, fecha_propuesta: new Date(Date.now() + 3600000).toISOString(), observaciones: 'Prueba automatizada.', ...overrides };
}
async function createRequest(donationId, account = accounts.organizacion, overrides = {}) {
  const result = await call('POST', `/api/donaciones/${donationId}/solicitudes`, request(overrides), account);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.data;
}
async function accepted() {
  const d = await createDonation(), s = await createRequest(d.id_donacion);
  assert.equal((await call('POST', `/api/solicitudes/${s.id_solicitud}/aceptar`, { id_donacion: d.id_donacion }, accounts.donante)).status, 200);
  return { d, s, delivery: await one('SELECT * FROM entregas WHERE id_solicitud = ?', [s.id_solicitud]) };
}

before(async () => {
  sandbox = await startSandbox();
  await execute(process.execPath, ['scripts/seed.mjs'], { env: { ...process.env } });
  ({ createApp } = await import('../server/app.js'));
  ({ db, pool } = await import('../server/db.js'));
  await listen();
  for (const name of ['donante', 'organizacion', 'organizacion2', 'admin']) accounts[name] = await login(name);
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  if (sandbox) await sandbox.stop();
});

test('API y MySQL responden con fecha del servidor; prueba de conexión de desarrollo', async () => {
  const result = await call('GET', '/api/health');
  assert.equal(result.status, 200); assert.equal(result.data.data.mysql, true);
  assert.equal(result.data.data.database, SANDBOX_DATABASE);
  assert.ok(Math.abs(Date.parse(result.data.data.server_time) - Date.now()) < 10000);
  assert.match(result.response.headers.get('content-security-policy'), /script-src 'self';/);
  assert.doesNotMatch(result.response.headers.get('content-security-policy'), /script-src[^;]*unsafe-inline/);
  const check = await call('GET', '/api/dev/conexion');
  assert.equal(check.status, 200);
  assert.equal(check.data.data.message, 'Conexión a MySQL establecida correctamente');
  assert.equal(check.data.data.tablas_encontradas, 13);
  assert.doesNotMatch(JSON.stringify(check.data), /password|contrase|root|MariaDB|10\.4/i);
});

test('Rutas: ida y traslado por separado, planificación persistente y nueva ubicación invalida ruta anterior', async () => {
  const previousProvider=process.env.ROUTING_PROVIDER, previousUrl=process.env.OSRM_URL;
  const calls=[];
  const provider=http.createServer((req,res)=>{
    const points=req.url.split('/driving/')[1].split('?')[0].split(';').map(pair=>pair.split(',').map(Number));
    calls.push(points);
    const outbound=Math.abs(points[0][0]+70.0278)<0.000001;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({code:'Ok',routes:[{distance:outbound?7100:8050,duration:(outbound?20:25)*60,geometry:{type:'LineString',coordinates:[points[0],[(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2],points[1]]}}]}));
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  process.env.ROUTING_PROVIDER='osrm';process.env.OSRM_URL=`http://127.0.0.1:${provider.address().port}`;
  const original=await one('SELECT latitud,longitud FROM organizaciones WHERE id_organizacion = ?',[accounts.organizacion.user.perfil.id_organizacion]);
  try{
    const {d,delivery}=await accepted();
    const routePath=`/api/seguimiento/${delivery.id_entrega}`;
    const result=await call('POST',`${routePath}/evaluacion`,{preparacion_min:7,recojo_min:9,entrega_min:4,margen_seguridad_min:17,demora_trafico_min:45,viaje_recojo_min:9999,etapa_custodia:'confirmado'},accounts.organizacion);
    assert.equal(result.status,200,JSON.stringify(result.data));
    const plan=result.data.data;
    assert.equal(plan.ruta.distancia_km,7.1);assert.equal(plan.ruta_recojo.distancia_km,8.05);
    assert.equal(plan.evaluacion.viaje_recojo_min,25);
    assert.equal(plan.evaluacion.demora_trafico_min,45);
    assert.ok(plan.evaluacion.tiempo_total_estimado_min>=127);
    assert.equal(calls.length,2);
    const saved=await one('SELECT * FROM evaluaciones_ruta WHERE id_solicitud = ? ORDER BY id_evaluacion DESC LIMIT 1',[delivery.id_solicitud]);
    const audit=await one("SELECT descripcion FROM auditoria WHERE tabla_afectada='evaluaciones_ruta' AND id_registro=? AND accion='calcular'",[saved.id_evaluacion]);
    assert.equal(JSON.parse(audit.descripcion).planificacion.demora_trafico_min,45);
    const reopened=(await call('GET',routePath,undefined,accounts.organizacion)).data.data;
    assert.equal(reopened.plan_actual.evaluacion.demora_trafico_min,45);
    assert.equal(reopened.plan_actual.evaluacion.margen_seguridad_min,17);
    assert.equal(reopened.plan_actual.ruta_recojo.duracion_estimada_min,25);
    const detail=(await call('GET',`/api/donaciones/${d.id_donacion}`,undefined,accounts.organizacion)).data.data;
    assert.equal(detail.plan_ruta.evaluacion.demora_trafico_min,45);
    const common={lugar:'Ubicación de prueba aislada',condicion_declarada:'sin_novedad',observacion:'Verificación manual exclusiva de la prueba.',responsable_entrega:'Donante de prueba',responsable_recibe:'Recolector de prueba'};
    assert.equal((await call('POST',`${routePath}/hitos`,{...common,tipo:'listo',version:reopened.version},accounts.donante)).status,201);
    assert.equal((await call('POST',`${routePath}/hitos`,{...common,tipo:'recogido',version:reopened.version+1},accounts.organizacion)).status,201);
    const moved=(await call('POST',`${routePath}/evaluacion`,{preparacion_min:400,recojo_min:300,viaje_recojo_min:9999},accounts.organizacion)).data.data;
    assert.equal(moved.ruta_recojo,null);assert.equal(moved.evaluacion.viaje_recojo_min,0);
    assert.equal(moved.evaluacion.preparacion_min,0);assert.equal(moved.evaluacion.recojo_min,0);
    assert.equal(moved.evaluacion.demora_trafico_min,45);
    assert.equal(calls.length,2);
    const detailPlan=(await call('POST',`/api/donaciones/${d.id_donacion}/evaluacion`,{preparacion_min:400,recojo_min:300},accounts.organizacion)).data.data;
    assert.equal(detailPlan.ruta_recojo,null);assert.equal(detailPlan.evaluacion.preparacion_min,0);assert.equal(detailPlan.evaluacion.recojo_min,0);
    assert.equal(calls.length,2);
    await db.query('UPDATE organizaciones SET latitud = latitud + 0.01 WHERE id_organizacion = ?',[delivery.id_organizacion||accounts.organizacion.user.perfil.id_organizacion]);
    const changed=(await call('GET',routePath,undefined,accounts.organizacion)).data.data;
    assert.equal(changed.plan_actual,undefined);
    assert.equal((await call('GET',`/api/donaciones/${d.id_donacion}`,undefined,accounts.organizacion)).data.data.plan_ruta,undefined);
  }finally{
    await db.query('UPDATE organizaciones SET latitud=?,longitud=? WHERE id_organizacion=?',[original.latitud,original.longitud,accounts.organizacion.user.perfil.id_organizacion]);
    if(previousProvider===undefined)delete process.env.ROUTING_PROVIDER;else process.env.ROUTING_PROVIDER=previousProvider;
    if(previousUrl===undefined)delete process.env.OSRM_URL;else process.env.OSRM_URL=previousUrl;
    await new Promise(resolve=>provider.close(resolve));
  }
});

test('Custodia: aceptación crea asignación, entrega y seguimiento con permisos y secuencia sin saltos', async () => {
  const { d, s, delivery } = await accepted();
  assert.equal((await call('POST', '/solicitudes/never', {}, accounts.donante)).status, 404);
  assert.ok(delivery); assert.equal(delivery.estado, 'pendiente'); assert.equal(delivery.id_donacion, d.id_donacion);
  assert.equal((await one('SELECT COUNT(*) AS total FROM asignaciones WHERE id_donacion = ? AND id_solicitud = ?', [d.id_donacion, s.id_solicitud])).total, 1);
  const path = `/api/seguimiento/${delivery.id_entrega}`;
  const initial = (await call('GET', path, undefined, accounts.admin)).data.data;
  assert.equal(initial.estado, 'preparacion'); assert.equal(initial.origen.direccion, d.direccion_recojo); assert.equal(initial.version, 1);
  assert.equal((await call('GET', path, undefined, accounts.organizacion2)).status, 403);
  assert.equal((await call('GET', path)).status, 401);
  const body = { tipo: 'recogido', version: 1, responsable_entrega: 'Donante prueba', responsable_recibe: 'Conductor prueba', lugar: 'Punto de recojo de prueba', condicion_declarada: 'sin_novedad', observacion: 'Envase cerrado observado para prueba.' };
  assert.equal((await call('POST', `${path}/hitos`, body, accounts.organizacion)).status, 409);
  assert.equal((await call('POST', `${path}/hitos`, { ...body, tipo: 'listo' }, accounts.organizacion)).status, 403);
  assert.equal((await call('POST', `${path}/hitos`, { ...body, tipo: 'listo' }, accounts.donante)).status, 201);
  const duplicate = await call('POST', `${path}/hitos`, { ...body, tipo: 'observacion' }, accounts.donante);
  assert.equal(duplicate.status, 409); assert.equal(duplicate.data.error.code, 'CUSTODY_CONFLICT');
  const loaded = (await call('GET', path, undefined, accounts.admin)).data.data;
  assert.equal(loaded.hitos.length, 2); assert.equal(loaded.estado, 'listo'); assert.ok(loaded.hitos[1].actor_nombre);
  assert.equal(loaded.hitos[1].lugar, 'Punto de recojo de prueba'); assert.equal(loaded.hitos[1].condicion_declarada, 'sin_novedad');
  const stages = await all("SELECT etapa FROM seguimientos WHERE id_donacion = ? AND etapa NOT IN ('publicada','solicitud_recibida') ORDER BY id_seguimiento", [d.id_donacion]);
  assert.deepEqual(stages.map(row => row.etapa), ['solicitud_aceptada', 'lista_recojo']);
});

test('Custodia: transferencias requieren responsables, concurrencia protegida y recepción completa', async () => {
  const { d, delivery } = await accepted();
  const path = `/api/seguimiento/${delivery.id_entrega}/hitos`;
  const body = { version: 1, lugar: 'Ubicación declarada de prueba', condicion_declarada: 'sin_novedad', observacion: 'Revisión declarada por responsable de prueba.', responsable_entrega: 'Donante prueba', responsable_recibe: 'Receptor prueba' };
  const simultaneous = await Promise.all([call('POST', path, { ...body, tipo: 'listo' }, accounts.donante), call('POST', path, { ...body, tipo: 'listo' }, accounts.donante)]);
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [201, 409]);
  assert.equal((await call('POST', path, { ...body, version: 2, tipo: 'recogido', responsable_recibe: '' }, accounts.organizacion)).status, 422);
  assert.equal((await call('POST', path, { ...body, version: 2, tipo: 'recogido' }, accounts.organizacion)).status, 201);
  assert.equal((await call('POST', `/api/donaciones/${d.id_donacion}/cancelar`, { motivo: 'No debe desaparecer la custodia activa.' }, accounts.donante)).status, 409);
  for (const [stage, version] of [['en_transito', 3], ['entregado', 4], ['confirmado', 5]]) assert.equal((await call('POST', path, { ...body, version, tipo: stage }, accounts.organizacion)).status, 201);
  const row = (await call('GET', `/api/seguimiento/${delivery.id_entrega}`, undefined, accounts.organizacion)).data.data;
  assert.equal(row.estado, 'confirmado'); assert.equal(row.hitos.length, 6); assert.equal(row.custodio_actual, 'Receptor prueba');
  assert.equal((await call('POST', path, { ...body, version: 6, tipo: 'observacion' }, accounts.organizacion)).status, 409);
  const stored = await one('SELECT * FROM entregas WHERE id_entrega = ?', [delivery.id_entrega]);
  assert.equal(stored.estado, 'confirmada'); assert.equal(stored.responsable_recepcion, 'Receptor prueba');
  assert.ok(stored.fecha_recojo && stored.fecha_entrega && stored.fecha_confirmacion);
  assert.equal((await one('SELECT estado FROM donaciones WHERE id_donacion = ?', [d.id_donacion])).estado, 'finalizada');
});

test('Incidencias: acceso por participante, no conformidad automática y resolución solo administrativa', async () => {
  const { d, delivery } = await accepted();
  const path = `/api/seguimiento/${delivery.id_entrega}`;
  const body = { tipo: 'observacion', version: 1, lugar: 'Lugar declarado de prueba', condicion_declarada: 'no_conforme', observacion: 'Se observa daño en el envase durante esta prueba.' };
  assert.equal((await call('POST', `${path}/hitos`, body, accounts.organizacion)).status, 201);
  const detail = (await call('GET', path, undefined, accounts.donante)).data.data;
  assert.equal(detail.incidencias_criticas, 1); assert.equal(detail.incidencias[0].tipo, 'calidad'); assert.equal(detail.incidencias[0].severidad, 'alta');
  const incident = detail.incidencias[0];
  assert.equal((await call('POST', `${path}/incidencias`, { tipo: 'demora', severidad: 'alta', titulo: 'Demora de prueba', descripcion: 'Detalle suficientemente largo de demora.' }, accounts.organizacion2)).status, 403);
  assert.equal((await call('POST', `/api/incidencias/${incident.id_incidencia}/resolver`, { resolucion: 'Resolución de prueba documentada.' }, accounts.donante)).status, 403);
  assert.equal((await call('POST', `/api/incidencias/${incident.id_incidencia}/resolver`, { resolucion: 'Resolución de prueba documentada, envase retirado.' }, accounts.admin)).status, 200);
  assert.equal((await call('POST', `/api/incidencias/${incident.id_incidencia}/resolver`, { resolucion: 'No duplicar la resolución ya registrada.' }, accounts.admin)).status, 409);
  const final = (await call('GET', path, undefined, accounts.organizacion)).data.data;
  assert.equal(final.incidencias_criticas, 0); assert.equal(final.incidencias[0].estado, 'resuelta'); assert.ok(final.incidencias[0].resuelto_por);
  // Resolver no borra el hito no conforme ni lo transforma en una certificación.
  assert.equal(final.ultimo_hito.condicion_declarada, 'no_conforme');
  const stored = await one('SELECT * FROM incidencias WHERE id_incidencia = ?', [incident.id_incidencia]);
  assert.equal(stored.estado, 'resuelta'); assert.ok(stored.fecha_resolucion); assert.equal(stored.id_donacion, d.id_donacion);
  const list = (await call('GET', '/api/incidencias', undefined, accounts.admin)).data.data;
  assert.ok(list.some(row => row.id_incidencia === incident.id_incidencia && row.id_seguimiento === delivery.id_entrega));
});

test('Catálogo: no muestra donaciones canceladas, finalizadas ni expiradas; el donante sí las consulta', async () => {
  const canceled = await createDonation({ alimento: 'Catálogo cancelada' });
  const finished = await createDonation({ alimento: 'Catálogo finalizada' });
  const expired = await createDonation({ alimento: 'Catálogo expirada' });
  const visible = await createDonation({ alimento: 'Catálogo disponible' });
  assert.equal((await call('POST', `/api/donaciones/${canceled.id_donacion}/cancelar`, { motivo: 'Condiciones modificadas en prueba.' }, accounts.donante)).status, 200);
  await db.query("UPDATE donaciones SET estado = 'finalizada' WHERE id_donacion = ?", [finished.id_donacion]);
  await db.query('UPDATE donaciones SET fecha_disponibilidad = NOW() - INTERVAL 3 HOUR, fecha_limite_recojo = NOW() - INTERVAL 1 HOUR WHERE id_donacion = ?', [expired.id_donacion]);
  const catalog = (await call('GET', '/api/donaciones', undefined, accounts.organizacion)).data.data.map(row => row.id_donacion);
  assert.ok(catalog.includes(visible.id_donacion));
  for (const hidden of [canceled, finished, expired]) assert.ok(!catalog.includes(hidden.id_donacion));
  const mine = new Map((await call('GET', '/api/donaciones', undefined, accounts.donante)).data.data.map(row => [row.id_donacion, row.estado]));
  assert.equal(mine.get(canceled.id_donacion), 'cancelada'); assert.equal(mine.get(finished.id_donacion), 'finalizada'); assert.equal(mine.get(expired.id_donacion), 'expirada');
  assert.equal((await call('GET', `/api/donaciones/${finished.id_donacion}`, undefined, accounts.organizacion)).status, 403);
});

test('Custodia: una incidencia crítica abierta impide confirmar recepción y conserva el historial', async () => {
  const { d, delivery } = await accepted();
  const created = await call('POST', `/api/seguimiento/${delivery.id_entrega}/incidencias`, { tipo: 'envase', severidad: 'alta', titulo: 'Envase pendiente de revisión', descripcion: 'Se requiere revisar el envase antes de confirmar la recepción.' }, accounts.organizacion);
  assert.equal(created.status, 201); assert.equal(created.data.data.titulo, 'Envase pendiente de revisión');
  const body = { lugar: 'Lugar declarado de prueba', condicion_declarada: 'sin_novedad', observacion: 'Registro manual durante prueba aislada.', responsable_entrega: 'Responsable que entrega', responsable_recibe: 'Responsable que recibe' };
  let version = 2;
  for (const stage of ['listo', 'recogido', 'en_transito', 'entregado']) {
    const response = await call('POST', `/api/seguimiento/${delivery.id_entrega}/hitos`, { ...body, tipo: stage, version }, stage === 'listo' ? accounts.donante : accounts.organizacion);
    assert.equal(response.status, 201, JSON.stringify(response.data)); version++;
  }
  const blocked = await call('POST', `/api/seguimiento/${delivery.id_entrega}/hitos`, { ...body, tipo: 'confirmado', version }, accounts.organizacion);
  assert.equal(blocked.status, 409); assert.equal(blocked.data.error.code, 'CUSTODY_REVIEW');
  const resolved = await call('POST', `/api/incidencias/${created.data.data.id_incidencia}/resolver`, { resolucion: 'Revisión de prueba registrada y envase sustituido por responsable.' }, accounts.admin);
  assert.equal(resolved.status, 200);
  assert.equal((await call('POST', `/api/seguimiento/${delivery.id_entrega}/hitos`, { ...body, tipo: 'confirmado', version: version + 1 }, accounts.organizacion)).status, 201);
  const stages = await all("SELECT etapa FROM seguimientos WHERE id_donacion = ? AND etapa NOT IN ('publicada','solicitud_recibida') ORDER BY id_seguimiento", [d.id_donacion]);
  assert.deepEqual(stages.map(row => row.etapa), ['solicitud_aceptada', 'lista_recojo', 'en_recojo', 'en_traslado', 'entregada', 'recepcion_confirmada']);
});

test('Autenticación: tabla usuarios, hash scrypt, cookie protegida, rol, error y cierre de sesión', async () => {
  const hashes = await all("SELECT password_hash FROM usuarios WHERE correo IN ('donante@realimenta.test','organizacion@realimenta.test','organizacion2@realimenta.test','admin@realimenta.test')");
  assert.equal(hashes.length, 4);
  assert.ok(hashes.every(row => row.password_hash.startsWith('scrypt$') && !row.password_hash.includes(password)));
  const result = await call('POST', '/api/auth/login', { correo: 'DONANTE@realimenta.test', contrasena: password });
  assert.match(result.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(result.response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.doesNotMatch(JSON.stringify(result.data), /password_hash|scrypt\$/);
  const session = { cookie: result.response.headers.get('set-cookie').split(';')[0], csrfToken: result.data.csrfToken };
  assert.equal((await call('GET', '/api/auth/me', undefined, session)).data.user.rol, 'donante');
  assert.equal((await call('GET', '/api/auth/me', undefined, { ...session, cookie: `${session.cookie.slice(0, -2)}xx` })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { correo: 'donante@realimenta.test', contrasena: 'incorrecta' })).status, 401);
  assert.equal((await call('POST', '/api/auth/logout', {}, session)).status, 200);
  assert.equal((await call('GET', '/api/auth/me', undefined, session)).status, 401);
});

test('Seguridad: autenticación, roles, CSRF, Origin, páginas y archivos privados', async () => {
  assert.equal((await call('POST', '/api/donaciones', donation())).status, 401);
  assert.equal((await call('POST', '/api/donaciones', donation(), accounts.organizacion)).status, 403);
  assert.equal((await call('POST', '/api/donaciones', donation(), accounts.admin)).status, 403);
  assert.equal((await call('POST', '/api/donaciones', donation(), { ...accounts.donante, csrfToken: '' })).status, 403);
  assert.equal((await call('POST', '/api/donaciones', donation(), accounts.donante, { Origin: 'https://otro-sitio.example' })).status, 403);
  assert.equal((await call('GET', '/donante.html')).status, 302);
  assert.equal((await call('GET', '/donante.html', undefined, accounts.organizacion)).status, 403);
  for (const path of ['/.env', '/db/migrations/001_initial.sql', '/server/config.js', '/package.json', '/uploads/donaciones/.htaccess', '/tests/fixtures/estructura_realimenta.sql']) assert.equal((await call('GET', path)).status, 404);
});

test('Registro público: administrador prohibido, usuario pendiente, perfil pendiente y datos geográficos persistentes', async () => {
  const payload = { nombre: 'Donante registrado de prueba', correo: 'nuevo@prueba.test', telefono: '000000000', rol: 'donante', contrasena: password, perfil: { nombre_establecimiento: 'Donante nuevo', direccion: 'Punto de prueba Puno', departamento: 'Puno', provincia: 'Puno', distrito: 'Puno', referencia: 'Frente al parque', latitud: -15.84, longitud: -70.02, ubicacion_confirmada: true } };
  assert.equal((await call('POST', '/api/auth/register', { ...payload, rol: 'administrador' })).status, 422);
  assert.equal((await call('POST', '/api/auth/register', { ...payload, perfil: { ...payload.perfil, ubicacion_confirmada: false } })).status, 422);
  assert.equal((await call('POST', '/api/auth/register', { ...payload, telefono: '1'.repeat(21) })).status, 422);
  const result = await call('POST', '/api/auth/register', payload);
  assert.equal(result.status, 201); assert.equal(result.data.data.estado_verificacion, 'pendiente');
  const user = await one('SELECT * FROM usuarios WHERE id_usuario = ?', [result.data.data.id_usuario]);
  assert.equal(user.nombres, payload.nombre); assert.equal(user.estado, 'pendiente'); assert.equal(user.rol, 'donante'); assert.match(user.password_hash, /^scrypt\$/);
  const row = await one('SELECT * FROM donantes WHERE id_usuario = ?', [result.data.data.id_usuario]);
  assert.equal(row.latitud, -15.84); assert.equal(row.estado_verificacion, 'pendiente'); assert.equal(row.responsable, payload.nombre);
  const loginResult = await call('POST', '/api/auth/login', { correo: payload.correo, contrasena: password });
  assert.equal(loginResult.status, 200);
  assert.equal(loginResult.data.user.perfil.referencia, 'Frente al parque'); assert.equal(loginResult.data.user.perfil.ubicacion_confirmada, true);
  const pending = { cookie: loginResult.response.headers.get('set-cookie').split(';')[0], csrfToken: loginResult.data.csrfToken };
  assert.equal((await call('POST', '/api/donaciones', donation(), pending)).status, 403);
  assert.equal((await call('POST', '/api/auth/register', payload)).status, 409);
  await db.query("UPDATE usuarios SET estado = 'suspendido' WHERE id_usuario = ?", [user.id_usuario]);
  assert.equal((await call('GET', '/api/auth/me', undefined, pending)).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { correo: payload.correo, contrasena: password })).status, 401);
});

test('Donaciones: creación, consulta, filtro, detalle, edición y cancelación persistentes en MySQL', async () => {
  const created = await createDonation({ referencia: 'Puerta lateral', requiere_cadena_frio: true, temperatura_declarada: '4 °C', perfil_alimento: 'panaderia' });
  let row = await one('SELECT * FROM donaciones WHERE id_donacion = ?', [created.id_donacion]);
  assert.equal(row.cantidad, 30); assert.equal(row.estado, 'disponible'); assert.equal(row.nombre_alimento, created.alimento);
  assert.equal(row.indicaciones_recojo, 'Puerta lateral'); assert.equal(row.tipo_conservacion, 'Temperatura ambiente'); assert.equal(row.tipo_envase, 'Caja de prueba');
  assert.equal(row.estado_producto, 'panaderia'); assert.equal(row.requiere_cadena_frio, true); assert.equal(row.temperatura_declarada, '4 °C');
  assert.equal(Math.abs(row.fecha_limite_recojo - new Date(created.fecha_limite_recojo)) < 1000, true);
  const detail = (await call('GET', `/api/donaciones/${created.id_donacion}`, undefined, accounts.donante)).data.data;
  assert.equal(detail.alimento, created.alimento); assert.equal(detail.referencia, 'Puerta lateral'); assert.equal(detail.distrito, 'Puno');
  let catalog = await call('GET', '/api/donaciones?q=Pan%20integral&categoria=Panader%C3%ADa&distrito=Puno', undefined, accounts.organizacion);
  assert.ok(catalog.data.data.some(d => d.id_donacion === created.id_donacion));
  assert.ok(!(await call('GET', '/api/donaciones?q=%25%25no-coincide', undefined, accounts.organizacion)).data.data.some(d => d.id_donacion === created.id_donacion));
  const edited = await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 35.257, alimento: 'Pan actualizado' }, accounts.donante);
  assert.equal(edited.status, 200, JSON.stringify(edited.data)); assert.equal(edited.data.data.cantidad, 35.26); assert.equal(edited.data.data.alimento, 'Pan actualizado');
  assert.equal(edited.data.data.referencia, 'Puerta lateral');
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/cancelar`, { motivo: 'Cambio de condiciones declarado.' }, accounts.donante)).status, 200);
  row = await one('SELECT * FROM donaciones WHERE id_donacion = ?', [created.id_donacion]);
  assert.equal(row.estado, 'cancelada');
  assert.equal((await call('GET', `/api/donaciones/${created.id_donacion}`, undefined, accounts.donante)).data.data.motivo_cancelacion, 'Cambio de condiciones declarado.');
  catalog = await call('GET', '/api/donaciones', undefined, accounts.organizacion);
  assert.ok(!catalog.data.data.some(d => d.id_donacion === created.id_donacion));
  assert.equal((await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 40 }, accounts.donante)).status, 409);
});

test('Donaciones: cantidad, cronología, coordenadas, tamaños y obligatorios inválidos producen 422 comprensible', async () => {
  for (const override of [{ cantidad: 0 }, { cantidad: -1 }, { cantidad: 0.001 }, { alimento: '' }, { latitud_recojo: 95 }, { envase: 'x'.repeat(101) }, { conservacion_declarada: 'x'.repeat(101) }, { temperatura_declarada: 'x'.repeat(51) }, { fecha_limite_recojo: new Date(Date.now() - 1000).toISOString() }, { fecha_limite_aprovechamiento_declarada: new Date(Date.now() + 60000).toISOString() }, { fecha_disponibilidad: '2026-01-01T10:00' }]) {
    const result = await call('POST', '/api/donaciones', donation(override), accounts.donante);
    assert.equal(result.status, 422, JSON.stringify(result.data));
    assert.ok(result.data.error.message.length > 10);
  }
  assert.equal((await call('GET', '/api/donaciones/no-numero', undefined, accounts.donante)).status, 400);
});

test('Propiedad: otro donante no puede leer, editar, cancelar ni aceptar donaciones ajenas', async () => {
  const hash = (await one("SELECT password_hash FROM usuarios WHERE correo = 'donante@realimenta.test'")).password_hash;
  const second = await db.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES ('Segundo donante', 'otro@realimenta.test', ?, '000000000', 'donante', 'activo')", [hash]);
  await db.query("INSERT INTO donantes (id_usuario, nombre_establecimiento, direccion, distrito, latitud, longitud, estado_verificacion) VALUES (?, 'Otro donante', 'Punto público de prueba', 'Puno', -15.84, -70.02, 'verificado')", [second.insertId]);
  const other = await login('otro');
  const created = await createDonation();
  const req = await createRequest(created.id_donacion);
  assert.equal((await call('GET', `/api/donaciones/${created.id_donacion}`, undefined, other)).status, 403);
  assert.equal((await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 50 }, other)).status, 403);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/cancelar`, { motivo: 'Motivo de prueba' }, other)).status, 403);
  assert.equal((await call('POST', `/api/solicitudes/${req.id_solicitud}/aceptar`, {}, other)).status, 403);
  assert.ok(!(await call('GET', '/api/donaciones', undefined, other)).data.data.some(row => row.id_donacion === created.id_donacion));
  const hidden = await call('POST', '/api/donaciones', donation({ alimento: 'Publicación que pierde elegibilidad' }), other);
  assert.equal(hidden.status, 201);
  await db.query("UPDATE donantes SET estado_verificacion = 'pendiente' WHERE id_usuario = ?", [second.insertId]);
  assert.equal((await call('GET', `/api/donaciones/${hidden.data.data.id_donacion}`, undefined, accounts.organizacion)).status, 403);
  const eligibleCatalog = (await call('GET', '/api/donaciones', undefined, accounts.organizacion)).data.data;
  assert.ok(!eligibleCatalog.some(row => row.id_donacion === hidden.data.data.id_donacion));
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/evaluacion`, { id_solicitud: req.id_solicitud }, accounts.organizacion2)).status, 403);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/evaluacion`, { id_solicitud: 'no-numero' }, accounts.organizacion)).status, 400);
  const canceled = await createDonation({ alimento: 'Cancelada sin solicitud de la organización' });
  assert.equal((await call('POST', `/api/donaciones/${canceled.id_donacion}/cancelar`, { motivo: 'Prueba de acceso logístico restringido.' }, accounts.donante)).status, 200);
  assert.equal((await call('POST', `/api/donaciones/${canceled.id_donacion}/evaluacion`, {}, accounts.organizacion2)).status, 403);
});

test('Solicitudes: creación pendiente, datos anidados, recibidas por el donante, duplicado y bloqueo de edición', async () => {
  const created = await createDonation({ requiere_cadena_frio: true });
  const req = await createRequest(created.id_donacion, accounts.organizacion, { dispone_cadena_frio: true });
  const stored = await one('SELECT * FROM solicitudes WHERE id_solicitud = ?', [req.id_solicitud]);
  assert.equal(stored.estado, 'pendiente'); assert.equal(stored.telefono_recojo, '000000000'); assert.equal(stored.tipo_transporte, 'Vehículo de prueba');
  assert.equal(stored.recipiente, 'Caja de prueba'); assert.equal(stored.cantidad_solicitada, 30); assert.ok(stored.fecha_recojo_propuesta);
  const orgList = (await call('GET', '/api/solicitudes', undefined, accounts.organizacion)).data.data;
  const found = orgList.find(s => s.id_solicitud === req.id_solicitud);
  assert.equal(found.donacion.id_donacion, created.id_donacion); assert.ok(found.organizacion.nombre); assert.ok(found.donante.nombre_establecimiento);
  assert.equal(found.dispone_cadena_frio, true); assert.equal(found.transporte_declarado, 'Vehículo de prueba');
  const donorList = (await call('GET', '/api/solicitudes', undefined, accounts.donante)).data.data;
  assert.ok(donorList.some(s => s.id_solicitud === req.id_solicitud));
  assert.ok(!(await call('GET', '/api/solicitudes', undefined, accounts.organizacion2)).data.data.some(s => s.id_solicitud === req.id_solicitud));
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/solicitudes`, request(), accounts.organizacion)).status, 409);
  assert.equal((await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 55 }, accounts.donante)).status, 409);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/solicitudes`, request({ fecha_propuesta: new Date(Date.now() + 10 * 3600000).toISOString() }), accounts.organizacion2)).status, 422);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/solicitudes`, request({ telefono: '1'.repeat(21) }), accounts.organizacion2)).status, 422);
});

test('Solicitudes: rechazo, cancelación con propietario y reenvío sobre la misma fila (UNIQUE donación-organización)', async () => {
  const created = await createDonation();
  const first = await createRequest(created.id_donacion);
  assert.equal((await call('POST', `/api/solicitudes/${first.id_solicitud}/cancelar`, { motivo: 'Ya no podemos recoger.' }, accounts.organizacion2)).status, 403);
  assert.equal((await call('POST', `/api/solicitudes/${first.id_solicitud}/cancelar`, { motivo: 'Ya no podemos recoger.' }, accounts.organizacion)).status, 200);
  const again = await createRequest(created.id_donacion);
  assert.equal(again.id_solicitud, first.id_solicitud); assert.equal(again.estado, 'pendiente');
  assert.equal((await call('POST', `/api/solicitudes/${again.id_solicitud}/rechazar`, { motivo: 'Condiciones de coordinación no compatibles.' }, accounts.donante)).status, 200);
  assert.equal((await one('SELECT estado FROM solicitudes WHERE id_solicitud = ?', [again.id_solicitud])).estado, 'rechazada');
  const list = (await call('GET', `/api/solicitudes?id_donacion=${created.id_donacion}`, undefined, accounts.organizacion)).data.data;
  assert.equal(list[0].motivo_decision, 'Condiciones de coordinación no compatibles.');
  const actions = (await all("SELECT accion FROM auditoria WHERE tabla_afectada = 'solicitudes' AND id_registro = ? ORDER BY id_auditoria", [first.id_solicitud])).map(row => row.accion);
  assert.deepEqual(actions, ['crear', 'cancelar', 'reenviar', 'rechazar']);
  assert.equal((await one('SELECT COUNT(*) AS total FROM solicitudes WHERE id_donacion = ? AND id_organizacion = ?', [created.id_donacion, accounts.organizacion.user.perfil.id_organizacion])).total, 1);
});

test('Aceptación transaccional única: decisiones simultáneas, auto-rechazo, asignación UNIQUE y auditoría', async () => {
  const created = await createDonation();
  const one1 = await createRequest(created.id_donacion, accounts.organizacion);
  const two = await createRequest(created.id_donacion, accounts.organizacion2);
  const decisions = await Promise.all([one1, two].map(s => call('POST', `/api/solicitudes/${s.id_solicitud}/aceptar`, { id_donacion: created.id_donacion }, accounts.donante)));
  assert.deepEqual(decisions.map(d => d.status).sort(), [200, 409]);
  const rows = await all('SELECT * FROM solicitudes WHERE id_donacion = ?', [created.id_donacion]);
  assert.equal(rows.filter(r => r.estado === 'aceptada').length, 1);
  assert.equal(rows.filter(r => r.estado === 'rechazada').length, 1);
  assert.equal((await one('SELECT estado FROM donaciones WHERE id_donacion = ?', [created.id_donacion])).estado, 'en_proceso');
  const assignments = await all('SELECT * FROM asignaciones WHERE id_donacion = ?', [created.id_donacion]);
  assert.equal(assignments.length, 1); assert.equal(assignments[0].id_solicitud, rows.find(r => r.estado === 'aceptada').id_solicitud);
  const events = (await all(`SELECT accion FROM auditoria WHERE tabla_afectada = 'solicitudes' AND id_registro IN (?, ?)`, [one1.id_solicitud, two.id_solicitud])).map(r => r.accion);
  assert.ok(events.includes('aceptar')); assert.ok(events.includes('rechazar_no_seleccionada'));
  const rejected = rows.find(r => r.estado === 'rechazada');
  // La restricción UNIQUE de asignaciones impide una segunda asignación incluso fuera de la API.
  await assert.rejects(db.query('INSERT INTO asignaciones (id_donacion, id_solicitud) VALUES (?, ?)', [created.id_donacion, rejected.id_solicitud]), error => error.code === 'ER_DUP_ENTRY');
  assert.equal((await call('POST', `/api/solicitudes/${rejected.id_solicitud}/aceptar`, {}, accounts.donante)).status, 409);
  const acceptedRow = rows.find(r => r.estado === 'aceptada');
  const orgAccount = acceptedRow.id_organizacion === accounts.organizacion.user.perfil.id_organizacion ? accounts.organizacion : accounts.organizacion2;
  assert.equal((await call('POST', `/api/solicitudes/${acceptedRow.id_solicitud}/cancelar`, { motivo: 'Intento fuera de estado permitido' }, orgAccount)).status, 409);
});

test('Aceptación: la solicitud debe pertenecer a la donación indicada y fallar sin cambios parciales', async () => {
  const first = await createDonation(), second = await createDonation();
  const req = await createRequest(first.id_donacion);
  const mismatch = await call('POST', `/api/solicitudes/${req.id_solicitud}/aceptar`, { id_donacion: second.id_donacion }, accounts.donante);
  assert.equal(mismatch.status, 409); assert.equal(mismatch.data.error.code, 'REQUEST_DONATION_MISMATCH');
  assert.equal((await one('SELECT estado FROM solicitudes WHERE id_solicitud = ?', [req.id_solicitud])).estado, 'pendiente');
  assert.equal((await one('SELECT estado FROM donaciones WHERE id_donacion = ?', [first.id_donacion])).estado, 'disponible');
  assert.equal((await one('SELECT COUNT(*) AS total FROM asignaciones WHERE id_donacion = ?', [first.id_donacion])).total, 0);
  // Asignación existente (p. ej. registrada fuera de la API): el rollback deja todo como estaba.
  const other = await createRequest(first.id_donacion, accounts.organizacion2);
  await db.query('INSERT INTO asignaciones (id_donacion, id_solicitud) VALUES (?, ?)', [first.id_donacion, other.id_solicitud]);
  const blocked = await call('POST', `/api/solicitudes/${req.id_solicitud}/aceptar`, { id_donacion: first.id_donacion }, accounts.donante);
  assert.equal(blocked.status, 409); assert.equal(blocked.data.error.code, 'DONATION_ASSIGNED');
  assert.deepEqual((await all('SELECT estado FROM solicitudes WHERE id_donacion = ? ORDER BY id_solicitud', [first.id_donacion])).map(r => r.estado), ['pendiente', 'pendiente']);
  assert.equal((await one('SELECT estado FROM donaciones WHERE id_donacion = ?', [first.id_donacion])).estado, 'disponible');
  assert.equal((await one('SELECT COUNT(*) AS total FROM entregas WHERE id_donacion = ?', [first.id_donacion])).total, 0);
});

test('Vencimiento real del servidor impide nuevas solicitudes y registra historial', async () => {
  const created = await createDonation();
  const req = await createRequest(created.id_donacion);
  await db.query('UPDATE donaciones SET fecha_disponibilidad = NOW() - INTERVAL 3 HOUR, fecha_limite_recojo = NOW() - INTERVAL 1 HOUR WHERE id_donacion = ?', [created.id_donacion]);
  const catalog = await call('GET', '/api/donaciones', undefined, accounts.organizacion);
  assert.ok(!catalog.data.data.some(d => d.id_donacion === created.id_donacion));
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/solicitudes`, request(), accounts.organizacion2)).status, 409);
  assert.equal((await one('SELECT estado FROM donaciones WHERE id_donacion = ?', [created.id_donacion])).estado, 'expirada');
  assert.equal((await one('SELECT estado FROM solicitudes WHERE id_solicitud = ?', [req.id_solicitud])).estado, 'rechazada');
  assert.ok(await one("SELECT 1 FROM auditoria WHERE tabla_afectada = 'donaciones' AND id_registro = ? AND accion = 'vencer'", [created.id_donacion]));
});

test('Integridad referencial de MySQL rechaza solicitud huérfana', async () => {
  await assert.rejects(db.query(`INSERT INTO solicitudes (id_donacion, id_organizacion, responsable_recojo, telefono_recojo, tipo_transporte, recipiente, fecha_recojo_propuesta)
    VALUES (2147483000, ?, 'Prueba', '000000000', 'Vehículo', 'Caja', NOW() + INTERVAL 1 HOUR)`, [accounts.organizacion.user.perfil.id_organizacion]), error => error.code === 'ER_NO_REFERENCED_ROW_2');
});

test('Sesiones y donaciones persisten al reiniciar instancia de aplicación; contenido XSS permanece texto JSON', async () => {
  const unsafeText = '<script>window.__xss=true</script>';
  const created = await createDonation({ descripcion: unsafeText });
  await new Promise(resolve => server.close(resolve));
  await listen();
  const detail = await call('GET', `/api/donaciones/${created.id_donacion}`, undefined, accounts.donante);
  assert.equal(detail.status, 200); assert.equal(detail.data.data.descripcion, unsafeText);
  assert.match(detail.response.headers.get('content-type'), /application\/json/);
  const profile = await call('GET', '/api/auth/me', undefined, accounts.donante);
  assert.equal(profile.status, 200); assert.equal(profile.data.user.id_usuario, accounts.donante.user.id_usuario);
  assert.ok(await one('SELECT 1 FROM donaciones WHERE id_donacion = ?', [created.id_donacion]));
});

test('Persistencia de donaciones y sesiones después de detener y reiniciar un proceso Node real', async () => {
  const created = await createDonation({ alimento: 'Persistencia entre procesos Node' });
  const portProbe = net.createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  async function startProcess() {
    const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), APP_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('El backend de prueba no inició en 15 segundos.')); }, 15000);
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('REAlimenta disponible')) { clearTimeout(timer); resolve(); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error(`El backend de prueba terminó con código ${code}.`)); });
    });
    assert.match(output, /Conexión a MySQL establecida correctamente/);
    return child;
  }
  async function stopProcess(child) {
    if (child.exitCode !== null) return;
    const done = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await done;
  }
  for (let restart = 0; restart < 2; restart++) {
    const child = await startProcess();
    try {
      const response = await fetch(`${origin}/api/donaciones/${created.id_donacion}`, { headers: { Cookie: accounts.donante.cookie } });
      assert.equal(response.status, 200);
      const json = await response.json();
      assert.equal(json.data.alimento, 'Persistencia entre procesos Node');
      assert.equal(json.data.id_donacion, created.id_donacion);
    } finally { await stopProcess(child); }
  }
});

test('Auditoría respeta acceso por actor, donante propietario y administrador', async () => {
  const admin = await call('GET', '/api/auditoria', undefined, accounts.admin);
  const org = await call('GET', '/api/auditoria', undefined, accounts.organizacion);
  assert.equal(admin.status, 200); assert.ok(admin.data.data.length > 0);
  assert.ok(admin.data.data.every(row => row.entidad && row.accion && row.fecha_evento));
  assert.equal(org.status, 200);
  assert.ok(!org.data.data.some(row => row.accion === 'iniciar_sesion' && row.id_usuario === accounts.admin.user.id_usuario));
});
