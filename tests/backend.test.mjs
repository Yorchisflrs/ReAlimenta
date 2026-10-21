import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const originalUrl = process.env.DATABASE_URL;
const databaseName = `realimenta_test_${process.pid}_${randomBytes(4).toString('hex')}`;
let adminPool, pool, server, baseUrl, createApp;
const accounts = {};
const password = 'Realimenta2026!';

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
  return { alimento: 'Pan integral de prueba', categoria: 'Panadería', cantidad: 30, unidad: 'unidades', descripcion: 'Registro de prueba automatizada en base aislada.', fecha_disponibilidad: new Date(Date.now() - 60000).toISOString(), fecha_limite_recojo: new Date(Date.now() + 4 * 3600000).toISOString(), fecha_limite_aprovechamiento_declarada: new Date(Date.now() + 7 * 3600000).toISOString(), direccion_recojo: 'Punto público de prueba en Puno', distrito: 'Puno', latitud_recojo: -15.8402, longitud_recojo: -70.0278, conservacion_declarada: 'Condiciones declaradas únicamente para prueba.', requiere_cadena_frio: false, envase: 'Caja de prueba', ...overrides };
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

before(async () => {
  assert.ok(originalUrl, 'Configure DATABASE_URL para probar contra PostgreSQL real.');
  adminPool = new pg.Pool({ connectionString: originalUrl });
  assert.match(databaseName, /^realimenta_test_\d+_[a-f0-9]+$/);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(originalUrl); url.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = url.toString();
  const env = { ...process.env };
  await execute(process.execPath, ['scripts/migrate.mjs'], { env });
  await execute(process.execPath, ['scripts/seed.mjs'], { env });
  ({ createApp, pool } = await import('../server/app.js'));
  await listen();
  for (const name of ['donante', 'organizacion', 'organizacion2', 'admin']) accounts[name] = await login(name);
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  if (adminPool) {
    if (/^realimenta_test_\d+_[a-f0-9]+$/.test(databaseName)) await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await adminPool.end();
  }
  process.env.DATABASE_URL = originalUrl;
});

test('API y PostgreSQL real responden con fecha del servidor', async () => {
  const result = await call('GET', '/api/health');
  assert.equal(result.status, 200); assert.equal(result.data.data.postgres, true);
  assert.equal(result.data.data.database, databaseName);
  assert.ok(Math.abs(Date.parse(result.data.data.server_time) - Date.now()) < 10000);
  assert.match(result.response.headers.get('content-security-policy'), /script-src 'self';/);
  assert.doesNotMatch(result.response.headers.get('content-security-policy'), /script-src[^;]*unsafe-inline/);
});

test('Autenticación: hash scrypt, cookie protegida, rol, error y cierre de sesión', async () => {
  const hashes = (await pool.query('SELECT hash_contrasena FROM usuario')).rows;
  assert.equal(hashes.length, 4);
  assert.ok(hashes.every(row => row.hash_contrasena.startsWith('scrypt$') && !row.hash_contrasena.includes(password)));
  const result = await call('POST', '/api/auth/login', { correo: 'donante@realimenta.test', contrasena: password });
  assert.match(result.response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(result.response.headers.get('set-cookie'), /SameSite=Lax/);
  const session = { cookie: result.response.headers.get('set-cookie').split(';')[0], csrfToken: result.data.csrfToken };
  assert.equal((await call('GET', '/api/auth/me', undefined, session)).data.user.rol, 'donante');
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
  for (const path of ['/.env', '/db/migrations/001_initial.sql', '/server/config.js', '/package.json']) assert.equal((await call('GET', path)).status, 404);
});

test('Registro público: administrador prohibido, perfil pendiente y datos geográficos persistentes', async () => {
  const payload = { nombre: 'Donante registrado de prueba', correo: 'nuevo@prueba.test', telefono: '000000000', rol: 'donante', contrasena: password, perfil: { nombre_establecimiento: 'Donante nuevo', direccion: 'Punto de prueba Puno', departamento: 'Puno', provincia: 'Puno', distrito: 'Puno', referencia: 'Prueba', latitud: -15.84, longitud: -70.02, ubicacion_confirmada: true } };
  assert.equal((await call('POST', '/api/auth/register', { ...payload, rol: 'administrador' })).status, 422);
  assert.equal((await call('POST', '/api/auth/register', { ...payload, perfil: { ...payload.perfil, ubicacion_confirmada: false } })).status, 422);
  const result = await call('POST', '/api/auth/register', payload);
  assert.equal(result.status, 201); assert.equal(result.data.data.estado_verificacion, 'pendiente');
  const row = (await pool.query('SELECT * FROM donante WHERE id_usuario=$1', [result.data.data.id_usuario])).rows[0];
  assert.equal(row.latitud, -15.84); assert.equal(row.ubicacion_confirmada, true);
  const loginResult = await call('POST', '/api/auth/login', { correo: payload.correo, contrasena: password });
  const pending = { cookie: loginResult.response.headers.get('set-cookie').split(';')[0], csrfToken: loginResult.data.csrfToken };
  assert.equal((await call('POST', '/api/donaciones', donation(), pending)).status, 403);
  assert.equal((await call('POST', '/api/auth/register', payload)).status, 409);
});

test('Donaciones: creación, consulta, filtro, detalle, edición y cancelación persistentes', async () => {
  const created = await createDonation();
  let row = (await pool.query('SELECT * FROM donacion WHERE id_donacion=$1', [created.id_donacion])).rows[0];
  assert.equal(Number(row.cantidad), 30); assert.equal(row.estado, 'disponible');
  assert.equal((await call('GET', `/api/donaciones/${created.id_donacion}`, undefined, accounts.donante)).data.data.alimento, created.alimento);
  let catalog = await call('GET', '/api/donaciones?q=Pan%20integral&categoria=Panader%C3%ADa&distrito=Puno', undefined, accounts.organizacion);
  assert.ok(catalog.data.data.some(d => d.id_donacion === created.id_donacion));
  const edited = await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 35, alimento: 'Pan actualizado' }, accounts.donante);
  assert.equal(edited.status, 200); assert.equal(Number(edited.data.data.cantidad), 35);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/cancelar`, { motivo: 'Cambio de condiciones declarado.' }, accounts.donante)).status, 200);
  row = (await pool.query('SELECT * FROM donacion WHERE id_donacion=$1', [created.id_donacion])).rows[0];
  assert.equal(row.estado, 'cancelada'); assert.ok(row.motivo_cancelacion);
  catalog = await call('GET', '/api/donaciones', undefined, accounts.organizacion);
  assert.ok(!catalog.data.data.some(d => d.id_donacion === created.id_donacion));
  assert.equal((await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 40 }, accounts.donante)).status, 409);
});

test('Donaciones: cantidad, cronología, coordenadas y obligatorios inválidos producen 422 comprensible', async () => {
  for (const override of [{ cantidad: 0 }, { cantidad: -1 }, { alimento: '' }, { latitud_recojo: 95 }, { fecha_limite_recojo: new Date(Date.now() - 1000).toISOString() }, { fecha_limite_aprovechamiento_declarada: new Date(Date.now() + 60000).toISOString() }, { fecha_disponibilidad: '2026-01-01T10:00' }]) {
    const result = await call('POST', '/api/donaciones', donation(override), accounts.donante);
    assert.equal(result.status, 422, JSON.stringify(result.data));
    assert.ok(result.data.error.message.length > 10);
  }
  assert.equal((await call('GET', '/api/donaciones/no-numero', undefined, accounts.donante)).status, 400);
});

test('Propiedad: otro donante no puede leer, editar, cancelar ni aceptar donaciones ajenas', async () => {
  const hash = (await pool.query("SELECT hash_contrasena FROM usuario WHERE correo='donante@realimenta.test'")).rows[0].hash_contrasena;
  const second = (await pool.query("INSERT INTO usuario(nombre,correo,hash_contrasena,telefono,rol) VALUES('Segundo donante','otro@realimenta.test',$1,'000000000','donante') RETURNING id_usuario", [hash])).rows[0];
  await pool.query("INSERT INTO donante(id_usuario,nombre_establecimiento,direccion,distrito,latitud,longitud,ubicacion_confirmada,estado_verificacion) VALUES($1,'Otro donante','Punto público de prueba','Puno',-15.84,-70.02,true,'verificado')", [second.id_usuario]);
  const other = await login('otro');
  const created = await createDonation();
  const req = await createRequest(created.id_donacion);
  assert.equal((await call('GET', `/api/donaciones/${created.id_donacion}`, undefined, other)).status, 403);
  assert.equal((await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 50 }, other)).status, 403);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/cancelar`, { motivo: 'Motivo de prueba' }, other)).status, 403);
  assert.equal((await call('POST', `/api/solicitudes/${req.id_solicitud}/aceptar`, {}, other)).status, 403);
  const hidden = await call('POST', '/api/donaciones', donation({ alimento: 'Publicación que pierde elegibilidad' }), other);
  assert.equal(hidden.status, 201);
  await pool.query("UPDATE donante SET estado_verificacion='pendiente' WHERE id_usuario=$1", [second.id_usuario]);
  assert.equal((await call('GET', `/api/donaciones/${hidden.data.data.id_donacion}`, undefined, accounts.organizacion)).status, 403);
  const eligibleCatalog = (await call('GET', '/api/donaciones', undefined, accounts.organizacion)).data.data;
  assert.ok(!eligibleCatalog.some(row => row.id_donacion === hidden.data.data.id_donacion));
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/evaluacion`, { id_solicitud: req.id_solicitud }, accounts.organizacion2)).status, 403);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/evaluacion`, { id_solicitud: 'no-numero' }, accounts.organizacion)).status, 400);
  const canceled = await createDonation({ alimento: 'Cancelada sin solicitud de la organización' });
  assert.equal((await call('POST', `/api/donaciones/${canceled.id_donacion}/cancelar`, { motivo: 'Prueba de acceso logístico restringido.' }, accounts.donante)).status, 200);
  assert.equal((await call('POST', `/api/donaciones/${canceled.id_donacion}/evaluacion`, {}, accounts.organizacion2)).status, 403);
});

test('Solicitudes: creación, persistencia, datos anidados, duplicado y bloqueo de edición', async () => {
  const created = await createDonation();
  const req = await createRequest(created.id_donacion);
  assert.equal((await pool.query('SELECT estado FROM solicitud WHERE id_solicitud=$1', [req.id_solicitud])).rows[0].estado, 'pendiente');
  const orgList = (await call('GET', '/api/solicitudes', undefined, accounts.organizacion)).data.data;
  const found = orgList.find(s => s.id_solicitud === req.id_solicitud);
  assert.equal(found.donacion.id_donacion, created.id_donacion); assert.ok(found.organizacion.nombre); assert.ok(found.donante.nombre_establecimiento);
  const donorList = (await call('GET', '/api/solicitudes', undefined, accounts.donante)).data.data;
  assert.ok(donorList.some(s => s.id_solicitud === req.id_solicitud));
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/solicitudes`, request(), accounts.organizacion)).status, 409);
  assert.equal((await call('PATCH', `/api/donaciones/${created.id_donacion}`, { cantidad: 55 }, accounts.donante)).status, 409);
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/solicitudes`, request({ fecha_propuesta: new Date(Date.now() + 10 * 3600000).toISOString() }), accounts.organizacion2)).status, 422);
});

test('Solicitudes: rechazo, cancelación con propietario y reenvío permitido', async () => {
  const created = await createDonation();
  let req = await createRequest(created.id_donacion);
  assert.equal((await call('POST', `/api/solicitudes/${req.id_solicitud}/cancelar`, { motivo: 'Ya no podemos recoger.' }, accounts.organizacion2)).status, 403);
  assert.equal((await call('POST', `/api/solicitudes/${req.id_solicitud}/cancelar`, { motivo: 'Ya no podemos recoger.' }, accounts.organizacion)).status, 200);
  req = await createRequest(created.id_donacion);
  assert.equal((await call('POST', `/api/solicitudes/${req.id_solicitud}/rechazar`, { motivo: 'Condiciones de coordinación no compatibles.' }, accounts.donante)).status, 200);
  assert.equal((await pool.query('SELECT estado FROM solicitud WHERE id_solicitud=$1', [req.id_solicitud])).rows[0].estado, 'rechazada');
});

test('Aceptación transaccional única: dos decisiones simultáneas, auto-rechazo y auditoría', async () => {
  const created = await createDonation();
  const one = await createRequest(created.id_donacion, accounts.organizacion);
  const two = await createRequest(created.id_donacion, accounts.organizacion2);
  const decisions = await Promise.all([one, two].map(s => call('POST', `/api/solicitudes/${s.id_solicitud}/aceptar`, {}, accounts.donante)));
  assert.deepEqual(decisions.map(d => d.status).sort(), [200, 409]);
  const rows = (await pool.query('SELECT * FROM solicitud WHERE id_donacion=$1', [created.id_donacion])).rows;
  assert.equal(rows.filter(r => r.estado === 'aceptada').length, 1);
  assert.equal(rows.filter(r => r.estado === 'rechazada').length, 1);
  assert.equal((await pool.query('SELECT estado FROM donacion WHERE id_donacion=$1', [created.id_donacion])).rows[0].estado, 'en_proceso');
  const events = (await pool.query("SELECT accion FROM auditoria WHERE entidad='solicitud' AND id_entidad=ANY($1::int[])", [[one.id_solicitud, two.id_solicitud]])).rows.map(r => r.accion);
  assert.ok(events.includes('aceptar')); assert.ok(events.includes('rechazar_no_seleccionada'));
  const rejected = rows.find(r => r.estado === 'rechazada');
  await assert.rejects(pool.query("UPDATE solicitud SET estado='aceptada' WHERE id_solicitud=$1", [rejected.id_solicitud]), error => error.code === '23505');
  const accepted = rows.find(r => r.estado === 'aceptada');
  const orgAccount = accepted.id_organizacion === accounts.organizacion.user.perfil.id_organizacion ? accounts.organizacion : accounts.organizacion2;
  assert.equal((await call('POST', `/api/solicitudes/${accepted.id_solicitud}/cancelar`, { motivo: 'Intento fuera de estado permitido' }, orgAccount)).status, 409);
});

test('Vencimiento real del servidor impide nuevas solicitudes y registra historial', async () => {
  const created = await createDonation();
  const req = await createRequest(created.id_donacion);
  await pool.query("UPDATE donacion SET fecha_disponibilidad=now()-interval '3 hours',fecha_limite_recojo=now()-interval '1 hour' WHERE id_donacion=$1", [created.id_donacion]);
  const catalog = await call('GET', '/api/donaciones', undefined, accounts.organizacion);
  assert.ok(!catalog.data.data.some(d => d.id_donacion === created.id_donacion));
  assert.equal((await call('POST', `/api/donaciones/${created.id_donacion}/solicitudes`, request(), accounts.organizacion2)).status, 409);
  assert.equal((await pool.query('SELECT estado FROM donacion WHERE id_donacion=$1', [created.id_donacion])).rows[0].estado, 'vencida');
  assert.equal((await pool.query('SELECT estado FROM solicitud WHERE id_solicitud=$1', [req.id_solicitud])).rows[0].estado, 'rechazada');
  assert.ok((await pool.query("SELECT 1 FROM auditoria WHERE entidad='donacion' AND id_entidad=$1 AND accion='vencer'", [created.id_donacion])).rowCount);
});

test('Integridad referencial de PostgreSQL rechaza solicitud huérfana', async () => {
  await assert.rejects(pool.query(`INSERT INTO solicitud(id_donacion,id_organizacion,responsable_recojo,telefono,transporte_declarado,recipiente_declarado,fecha_propuesta)
    VALUES(2147483000,$1,'Prueba','000000000','Vehículo','Caja',now()+interval '1 hour')`, [accounts.organizacion.user.perfil.id_organizacion]), error => error.code === '23503');
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
  assert.ok((await pool.query('SELECT 1 FROM donacion WHERE id_donacion=$1', [created.id_donacion])).rowCount);
  // La ejecución de HTML se verifica adicionalmente en la prueba de navegador, no se afirma con esta prueba API.
});

test('Persistencia de donaciones y sesiones después de detener y reiniciar un proceso Node real', async () => {
  const created = await createDonation({ alimento: 'Persistencia entre procesos Node' });
  const portProbe = net.createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  async function startProcess() {
    const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL, HOST: '127.0.0.1', PORT: String(port), APP_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('El backend de prueba no inició en 15 segundos.')); }, 15000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('REAlimenta disponible')) { clearTimeout(timer); resolve(); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error(`El backend de prueba terminó con código ${code}.`)); });
    });
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
  assert.equal(org.status, 200);
  assert.ok(!org.data.data.some(row => row.accion === 'iniciar_sesion' && row.id_usuario === accounts.admin.user.id_usuario));
});
