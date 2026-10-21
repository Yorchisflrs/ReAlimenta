import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlink, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const originalUrl = process.env.DATABASE_URL;
const databaseName = `realimenta_photos_test_${process.pid}_${randomBytes(4).toString('hex')}`;
const directory = fileURLToPath(new URL('../.local/uploads/donaciones/', import.meta.url));
const password = 'Realimenta2026!';
let adminPool, pool, server, baseUrl, png, donorCounter = 0, sourceHash;
const accounts = {};

async function call(method, route, body, account, extraHeaders = {}) {
  const headers = { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(account ? { Cookie: account.cookie, 'x-csrf-token': account.csrfToken } : {}), ...extraHeaders };
  const response = await fetch(`${baseUrl}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const data = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, response, data };
}
async function login(correo) {
  const result = await call('POST', '/api/auth/login', { correo, contrasena: password });
  assert.equal(result.status, 200);
  return { cookie: result.response.headers.get('set-cookie').split(';')[0], csrfToken: result.data.csrfToken, user: result.data.user };
}
async function donor() {
  const correo = `photos-donor-${++donorCounter}@realimenta.test`;
  const row = (await pool.query(`INSERT INTO usuario(nombre,correo,hash_contrasena,telefono,rol,es_demostracion)
    VALUES('Donante de prueba de fotografías',$1,$2,'000000000','donante',true) RETURNING id_usuario`, [correo, sourceHash])).rows[0];
  await pool.query(`INSERT INTO donante(id_usuario,nombre_establecimiento,direccion,distrito,latitud,longitud,ubicacion_confirmada,estado_verificacion)
    VALUES($1,'Establecimiento de prueba aislada','Punto público demostrativo de Puno','Puno',-15.840908,-70.0289581,true,'verificado')`, [row.id_usuario]);
  return login(correo);
}
async function donation(account) {
  const result = await call('POST', '/api/donaciones', { alimento: 'Alimento para prueba de fotografías', categoria: 'Panadería', cantidad: 12, unidad: 'unidades', descripcion: 'Registro de una base temporal aislada.', fecha_disponibilidad: new Date(Date.now() - 60000).toISOString(), fecha_limite_recojo: new Date(Date.now() + 4 * 3600000).toISOString(), fecha_limite_aprovechamiento_declarada: new Date(Date.now() + 7 * 3600000).toISOString(), direccion_recojo: 'Punto público demostrativo de Puno', distrito: 'Puno', latitud_recojo: -15.840908, longitud_recojo: -70.0289581, conservacion_declarada: 'Conservación declarada de prueba', requiere_cadena_frio: false, envase: 'Caja de prueba' }, account);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.data;
}
async function upload(donationId, account, buffer = png, mime = 'image/png', extraHeaders = {}) {
  const headers = { 'Content-Type': mime, 'x-file-name': encodeURIComponent('fotografía de prueba.png'), ...(account ? { Cookie: account.cookie, 'x-csrf-token': account.csrfToken } : {}), ...extraHeaders };
  const response = await fetch(`${baseUrl}/api/donaciones/${donationId}/foto`, { method: 'POST', headers, body: buffer });
  return { status: response.status, response, data: await response.json() };
}
async function media(url, account) {
  const response = await fetch(`${baseUrl}${url}`, { headers: account ? { Cookie: account.cookie } : {} });
  return { status: response.status, response, buffer: Buffer.from(await response.arrayBuffer()) };
}
async function request(donationId) {
  const result = await call('POST', `/api/donaciones/${donationId}/solicitudes`, { responsable_recojo: 'Responsable de fotografía prueba', telefono: '000000000', transporte_declarado: 'Vehículo de prueba', recipiente_declarado: 'Caja de prueba', dispone_cadena_frio: false, fecha_propuesta: new Date(Date.now() + 3600000).toISOString() }, accounts.organizacion);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.data;
}

before(async () => {
  assert.ok(originalUrl, 'Configure DATABASE_URL para probar fotografías con PostgreSQL real.');
  adminPool = new pg.Pool({ connectionString: originalUrl });
  assert.match(databaseName, /^realimenta_photos_test_\d+_[a-f0-9]+$/);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(originalUrl); url.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = url.toString();
  await execute(process.execPath, ['scripts/migrate.mjs'], { env: { ...process.env } });
  await execute(process.execPath, ['scripts/seed.mjs'], { env: { ...process.env } });
  const { createApp, pool: appPool } = await import('../server/app.js');
  pool = appPool;
  sourceHash = (await pool.query("SELECT hash_contrasena FROM usuario WHERE correo='donante@realimenta.test'")).rows[0].hash_contrasena;
  png = await sharp({ create: { width: 500, height: 300, channels: 3, background: '#11845b' } }).png().toBuffer();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['organizacion', 'organizacion2', 'admin']) accounts[name] = await login(`${name}@realimenta.test`);
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  const cleanupErrors = [];
  if (pool) {
    // Solo archivos enumerados por la base temporal de ESTA suite. Nunca recorrer/borrar la carpeta compartida.
    const rows = (await pool.query('SELECT archivo FROM foto_donacion').catch(() => ({ rows: [] }))).rows;
    for (const { archivo } of rows) {
      if (!/^[a-f0-9]{40}\.webp$/.test(archivo)) { cleanupErrors.push(new Error('Nombre de prueba fuera del patrón seguro.')); continue; }
      const target = path.resolve(directory, archivo);
      if (path.dirname(target) !== path.resolve(directory)) { cleanupErrors.push(new Error('Ruta de prueba fuera del directorio permitido.')); continue; }
      try { await unlink(target); } catch (error) { if (error.code !== 'ENOENT') cleanupErrors.push(error); }
    }
    await pool.end();
  }
  if (adminPool) {
    if (/^realimenta_photos_test_\d+_[a-f0-9]+$/.test(databaseName)) await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await adminPool.end();
  }
  if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
  assert.equal(cleanupErrors.length, 0, cleanupErrors.map(error => error.message).join('; '));
});

test('Fotografías: JPG válido se recodifica a WebP, rota, reduce a 1600 y elimina EXIF/ICC', async () => {
  const account = await donor(), d = await donation(account);
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#eeeecc' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.ok((await sharp(input).metadata()).exif);
  const uploaded = await upload(d.id_donacion, account, input, 'image/jpeg', { 'x-file-name': encodeURIComponent('../../original privada.jpg') });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  assert.match(uploaded.data.data.url, /^\/media\/donaciones\/[a-f0-9]{40}\.webp$/);
  const row = (await pool.query('SELECT * FROM foto_donacion WHERE id_foto=$1', [uploaded.data.data.id_foto])).rows[0];
  assert.ok((await stat(path.join(directory, row.archivo))).isFile());
  const served = await media(uploaded.data.data.url, account);
  assert.equal(served.status, 200, served.status === 200 ? undefined : served.buffer.toString('utf8')); assert.match(served.response.headers.get('content-type'), /image\/webp/);
  assert.match(served.response.headers.get('cache-control'), /private/);
  const metadata = await sharp(served.buffer).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 800); assert.equal(metadata.height, 1600);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined); assert.equal(metadata.orientation, undefined);
  assert.equal(row.ancho, 800); assert.equal(row.alto, 1600); assert.equal(row.bytes, served.buffer.length);
  assert.ok((await pool.query("SELECT 1 FROM auditoria WHERE entidad='donacion' AND id_entidad=$1 AND accion='agregar_fotografia'", [d.id_donacion])).rowCount);
});

test('Fotografías: PNG y WebP válidos mantienen proporción sin ampliar y aparecen en detalle/catalogo', async () => {
  const account = await donor(), d = await donation(account);
  const one = await upload(d.id_donacion, account);
  const webp = await sharp(png).webp().toBuffer();
  const two = await upload(d.id_donacion, account, webp, 'image/webp');
  assert.equal(one.status, 201); assert.equal(two.status, 201);
  const details = (await call('GET', `/api/donaciones/${d.id_donacion}`, undefined, account)).data.data;
  assert.equal(details.fotos.length, 2); assert.equal(details.fotos[0].url, one.data.data.url);
  assert.equal(details.fotos[0].ancho, 500); assert.equal(details.fotos[0].alto, 300);
  const catalog = (await call('GET', '/api/donaciones', undefined, accounts.organizacion)).data.data;
  assert.equal(catalog.find(row => row.id_donacion === d.id_donacion).fotos[0].url, one.data.data.url);
});

test('Fotografías: rechaza SVG/GIF, PNG presentado como JPG, GIF/SVG como PNG y texto como JPG', async () => {
  const account = await donor(), d = await donation(account);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  const gif = await sharp(png).gif().toBuffer();
  assert.equal((await upload(d.id_donacion, account, svg, 'image/svg+xml')).status, 415);
  assert.equal((await upload(d.id_donacion, account, gif, 'image/gif')).status, 415);
  for (const [buffer, mime] of [[png, 'image/jpeg'], [gif, 'image/png'], [svg, 'image/png'], [Buffer.from('No es una fotografía'), 'image/jpeg']]) {
    const result = await upload(d.id_donacion, account, buffer, mime);
    assert.equal(result.status, 422, JSON.stringify(result.data)); assert.equal(result.data.error.code, 'PHOTO_INVALID');
  }
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM foto_donacion WHERE id_donacion=$1', [d.id_donacion])).rows[0].total, 0);
});

test('Fotografías: límite 5 MB y límite 25 megapíxeles con errores comprensibles', async () => {
  const account = await donor(), d = await donation(account);
  const tooLarge = await upload(d.id_donacion, account, Buffer.alloc(5 * 1024 * 1024 + 1, 42), 'image/jpeg');
  assert.equal(tooLarge.status, 413); assert.equal(tooLarge.data.error.code, 'FILE_TOO_LARGE'); assert.match(tooLarge.data.error.message, /5 MB/);
  const highPixels = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: '#ffffff' } }).png().toBuffer();
  assert.ok(highPixels.length < 5 * 1024 * 1024);
  const result = await upload(d.id_donacion, account, highPixels, 'image/png');
  assert.equal(result.status, 422); assert.equal(result.data.error.code, 'PHOTO_INVALID');
});

test('Fotografías: álbum máximo tres incluso con dos cargas finales simultáneas; primera portada estable', async () => {
  const account = await donor(), d = await donation(account);
  const first = await upload(d.id_donacion, account); assert.equal(first.status, 201);
  assert.equal((await upload(d.id_donacion, account)).status, 201);
  const parallel = await Promise.all([upload(d.id_donacion, account), upload(d.id_donacion, account)]);
  assert.deepEqual(parallel.map(result => result.status).sort(), [201, 409]);
  assert.equal(parallel.find(result => result.status === 409).data.error.code, 'PHOTO_LIMIT');
  const detail = (await call('GET', `/api/donaciones/${d.id_donacion}`, undefined, account)).data.data;
  assert.equal(detail.fotos.length, 3); assert.equal(detail.fotos[0].url, first.data.data.url);
});

test('Fotografías: exige sesión, CSRF, donante verificado y propiedad', async () => {
  const account = await donor(), other = await donor(), d = await donation(account);
  assert.equal((await upload(d.id_donacion, null)).status, 401);
  assert.equal((await upload(d.id_donacion, account, png, 'image/png', { 'x-csrf-token': '' })).status, 403);
  assert.equal((await upload(d.id_donacion, accounts.organizacion)).status, 403);
  assert.equal((await upload(d.id_donacion, accounts.admin)).status, 403);
  assert.equal((await upload(d.id_donacion, other)).status, 403);
  await pool.query("UPDATE donante SET estado_verificacion='pendiente' WHERE id_usuario=$1", [account.user.id_usuario]);
  assert.equal((await upload(d.id_donacion, account)).status, 403);
});

test('Fotografías: solicitudes activas y estado cancelado bloquean nuevas cargas', async () => {
  const account = await donor(), d = await donation(account);
  await request(d.id_donacion);
  const active = await upload(d.id_donacion, account);
  assert.equal(active.status, 409); assert.equal(active.data.error.code, 'PHOTO_REQUESTS');
  const canceled = await donation(account);
  assert.equal((await call('POST', `/api/donaciones/${canceled.id_donacion}/cancelar`, { motivo: 'Cancelación de prueba de fotografía.' }, account)).status, 200);
  assert.equal((await upload(canceled.id_donacion, account)).status, 409);
});

test('Fotografías privadas: dueño/admin/catálogo elegible acceden; anónimo/otro donante no', async () => {
  const account = await donor(), other = await donor(), d = await donation(account);
  const uploaded = await upload(d.id_donacion, account); assert.equal(uploaded.status, 201);
  const url = uploaded.data.data.url;
  assert.equal((await media(url)).status, 401);
  assert.equal((await media(url, other)).status, 404);
  assert.equal((await media(url, account)).status, 200);
  assert.equal((await media(url, accounts.admin)).status, 200);
  assert.equal((await media(url, accounts.organizacion)).status, 200);
  assert.equal((await media('/media/donaciones/no-es-un-archivo.webp', account)).status, 404);
  await pool.query("UPDATE donante SET estado_verificacion='pendiente' WHERE id_usuario=$1", [account.user.id_usuario]);
  assert.equal((await media(url, accounts.organizacion)).status, 404);
});

test('Fotografías privadas: vencida u oculta no es catálogo; organización con solicitud propia conserva acceso', async () => {
  const account = await donor(), d = await donation(account);
  const uploaded = await upload(d.id_donacion, account); assert.equal(uploaded.status, 201);
  await request(d.id_donacion);
  await pool.query("UPDATE donacion SET fecha_disponibilidad=now()-interval '3 hours',fecha_limite_recojo=now()-interval '1 hour',ocultar_presentacion=true WHERE id_donacion=$1", [d.id_donacion]);
  assert.equal((await media(uploaded.data.data.url, accounts.organizacion2)).status, 404);
  assert.equal((await media(uploaded.data.data.url, accounts.organizacion)).status, 200);
  assert.equal((await media(uploaded.data.data.url, account)).status, 200);
  assert.equal((await upload(d.id_donacion, account)).status, 409);
});

test('Fotografías: solicitudes y seguimiento conservan álbum para los participantes autorizados', async () => {
  const account = await donor(), d = await donation(account);
  const uploaded = await upload(d.id_donacion, account); assert.equal(uploaded.status, 201);
  const s = await request(d.id_donacion);
  assert.equal((await call('POST', `/api/solicitudes/${s.id_solicitud}/aceptar`, {}, account)).status, 200);
  const list = (await call('GET', '/api/solicitudes', undefined, accounts.organizacion)).data.data;
  assert.equal(list.find(row => row.id_solicitud === s.id_solicitud).donacion.fotos[0].url, uploaded.data.data.url);
  const tracking = (await pool.query('SELECT id_seguimiento FROM seguimiento WHERE id_solicitud=$1', [s.id_solicitud])).rows[0];
  const response = await call('GET', `/api/seguimiento/${tracking.id_seguimiento}`, undefined, accounts.organizacion);
  assert.equal(response.status, 200); assert.equal(response.data.data.fotos[0].url, uploaded.data.data.url);
  assert.equal(response.data.data.donacion.fotos[0].url, uploaded.data.data.url);
  assert.equal((await media(uploaded.data.data.url, accounts.organizacion)).status, 200);
  assert.equal((await media(uploaded.data.data.url, accounts.organizacion2)).status, 404);
});
