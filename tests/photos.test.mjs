import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import path from 'node:path';
import { readdir, readFile, stat, writeFile, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startSandbox } from './helpers/mysql-sandbox.mjs';

const execute = promisify(execFile);
const password = 'Realimenta2026!';
const PHOTO_URL = /^\/media\/donaciones\/donacion_\d+_[a-f0-9]{16}\.webp$/;
let sandbox, db, pool, server, baseUrl, png, donorCounter = 0, sourceHash;
const accounts = {};
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

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
  const user = await db.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES ('Donante de prueba de fotografías', ?, ?, '000000000', 'donante', 'activo')", [correo, sourceHash]);
  await db.query("INSERT INTO donantes (id_usuario, nombre_establecimiento, direccion, distrito, latitud, longitud, estado_verificacion) VALUES (?, 'Establecimiento de prueba aislada', 'Punto público demostrativo de Puno', 'Puno', -15.840908, -70.0289581, 'verificado')", [user.insertId]);
  return login(correo);
}
async function donation(account) {
  const result = await call('POST', '/api/donaciones', { alimento: 'Alimento para prueba de fotografías', categoria: 'Panadería', cantidad: 12, unidad: 'unidades', descripcion: 'Registro de una base temporal aislada.', fecha_disponibilidad: new Date(Date.now() - 60000).toISOString(), fecha_limite_recojo: new Date(Date.now() + 4 * 3600000).toISOString(), fecha_limite_aprovechamiento_declarada: new Date(Date.now() + 7 * 3600000).toISOString(), direccion_recojo: 'Punto público demostrativo de Puno', distrito: 'Puno', latitud_recojo: -15.840908, longitud_recojo: -70.0289581, conservacion_declarada: 'Temperatura ambiente', requiere_cadena_frio: false, envase: 'Caja de prueba' }, account);
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
const storedFiles = async () => (await readdir(sandbox.uploads).catch(() => [])).sort();

before(async () => {
  sandbox = await startSandbox();
  await execute(process.execPath, ['scripts/seed.mjs'], { env: { ...process.env } });
  const { createApp } = await import('../server/app.js');
  ({ db, pool } = await import('../server/db.js'));
  sourceHash = (await one("SELECT password_hash FROM usuarios WHERE correo = 'donante@realimenta.test'")).password_hash;
  png = await sharp({ create: { width: 500, height: 300, channels: 3, background: '#11845b' } }).png().toBuffer();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['organizacion', 'organizacion2', 'admin']) accounts[name] = await login(`${name}@realimenta.test`);
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  // La carpeta de fotos de prueba vive dentro de la instancia temporal y se elimina con ella.
  if (sandbox) await sandbox.stop();
});

test('Fotografías: JPG válido se recodifica a WebP, rota, reduce a 1600, elimina EXIF/ICC y se registra en donacion_fotos', async () => {
  const account = await donor(), d = await donation(account);
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#eeeecc' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.ok((await sharp(input).metadata()).exif);
  const uploaded = await upload(d.id_donacion, account, input, 'image/jpeg', { 'x-file-name': encodeURIComponent('../../original privada.jpg') });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  assert.match(uploaded.data.data.url, PHOTO_URL);
  assert.ok(uploaded.data.data.nombre_archivo.startsWith(`donacion_${d.id_donacion}_`));
  const row = await one('SELECT * FROM donacion_fotos WHERE id_foto = ?', [uploaded.data.data.id_foto]);
  assert.equal(row.id_donacion, d.id_donacion); assert.equal(row.nombre_original, 'original privada.jpg');
  assert.equal(row.tipo_mime, 'image/webp'); assert.equal(row.es_principal, true);
  assert.equal(row.ruta_archivo, path.relative(process.cwd(), path.join(sandbox.uploads, row.nombre_archivo)).split(path.sep).join('/'));
  assert.ok((await stat(path.join(sandbox.uploads, row.nombre_archivo))).isFile());
  const served = await media(uploaded.data.data.url, account);
  assert.equal(served.status, 200); assert.match(served.response.headers.get('content-type'), /image\/webp/);
  assert.match(served.response.headers.get('cache-control'), /private/);
  const metadata = await sharp(served.buffer).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 800); assert.equal(metadata.height, 1600);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined); assert.equal(metadata.orientation, undefined);
  assert.equal(uploaded.data.data.ancho, 800); assert.equal(uploaded.data.data.alto, 1600); assert.equal(Number(row.tamano_bytes), served.buffer.length);
  assert.ok(await one("SELECT 1 FROM auditoria WHERE tabla_afectada = 'donacion_fotos' AND id_registro = ? AND accion = 'agregar_fotografia'", [row.id_foto]));
});

test('Fotografías: PNG y WebP válidos mantienen proporción y aparecen en Mis donaciones, detalle y catálogo', async () => {
  const account = await donor(), d = await donation(account);
  const first = await upload(d.id_donacion, account);
  const webp = await sharp(png).webp().toBuffer();
  const second = await upload(d.id_donacion, account, webp, 'image/webp');
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  assert.equal(first.data.data.ancho, 500); assert.equal(first.data.data.alto, 300);
  assert.equal(first.data.data.es_principal, true); assert.equal(second.data.data.es_principal, false);
  const details = (await call('GET', `/api/donaciones/${d.id_donacion}`, undefined, account)).data.data;
  assert.equal(details.fotos.length, 2); assert.equal(details.fotos[0].url, first.data.data.url); assert.equal(details.fotos[0].es_principal, true);
  const mine = (await call('GET', '/api/donaciones', undefined, account)).data.data;
  assert.equal(mine.find(row => row.id_donacion === d.id_donacion).fotos.length, 2);
  const catalog = (await call('GET', '/api/donaciones', undefined, accounts.organizacion)).data.data;
  assert.equal(catalog.find(row => row.id_donacion === d.id_donacion).fotos[0].url, first.data.data.url);
});

test('Fotografías: las cinco imágenes aportadas por el usuario se suben, registran y leen en MySQL', async () => {
  const account = await donor(), d = await donation(account);
  const files = [
    ['feria-gastronomica-puno.jpeg', 'image/jpeg'],
    ['trucha-plato-andino.jpeg', 'image/jpeg'],
    ['plato-tradicional-andino.png', 'image/png'],
    ['pan-artesanal-marca-original.jpeg', 'image/jpeg'],
    ['quesos-artesanales.jpeg', 'image/jpeg']
  ];
  for (const [name, mime] of files) {
    const buffer = await readFile(new URL(`../assets/images/fondos/${name}`, import.meta.url));
    const result = await upload(d.id_donacion, account, buffer, mime, { 'x-file-name': encodeURIComponent(name) });
    assert.equal(result.status, 201, `${name}: ${JSON.stringify(result.data)}`);
    const response = await media(result.data.data.url, account);
    assert.equal(response.status, 200, name);
    assert.equal((await sharp(response.buffer).metadata()).format, 'webp', name);
  }
  const detail = await call('GET', `/api/donaciones/${d.id_donacion}`, undefined, account);
  assert.equal(detail.data.data.fotos.length, files.length);
  assert.equal((await one('SELECT COUNT(*) AS total FROM donacion_fotos WHERE id_donacion = ?', [d.id_donacion])).total, files.length);
});

test('Fotografías: rechaza SVG/GIF/ejecutables, PNG presentado como JPG, GIF/SVG como PNG y texto como JPG', async () => {
  const account = await donor(), d = await donation(account);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  const gif = await sharp(png).gif().toBuffer();
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);
  assert.equal((await upload(d.id_donacion, account, svg, 'image/svg+xml')).status, 415);
  assert.equal((await upload(d.id_donacion, account, gif, 'image/gif')).status, 415);
  assert.equal((await upload(d.id_donacion, account, exe, 'application/x-msdownload')).status, 415);
  for (const [buffer, mime] of [[png, 'image/jpeg'], [gif, 'image/png'], [svg, 'image/png'], [exe, 'image/jpeg'], [Buffer.from('No es una fotografía'), 'image/jpeg']]) {
    const result = await upload(d.id_donacion, account, buffer, mime);
    assert.equal(result.status, 422, JSON.stringify(result.data)); assert.equal(result.data.error.code, 'PHOTO_INVALID');
  }
  assert.equal((await one('SELECT COUNT(*) AS total FROM donacion_fotos WHERE id_donacion = ?', [d.id_donacion])).total, 0);
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

test('Fotografías: álbum máximo de cinco incluso con dos cargas finales simultáneas; primera portada estable', async () => {
  const account = await donor(), d = await donation(account);
  const first = await upload(d.id_donacion, account); assert.equal(first.status, 201);
  for (let i = 0; i < 3; i++) assert.equal((await upload(d.id_donacion, account)).status, 201);
  const parallel = await Promise.all([upload(d.id_donacion, account), upload(d.id_donacion, account)]);
  assert.deepEqual(parallel.map(result => result.status).sort(), [201, 409]);
  assert.equal(parallel.find(result => result.status === 409).data.error.code, 'PHOTO_LIMIT');
  const detail = (await call('GET', `/api/donaciones/${d.id_donacion}`, undefined, account)).data.data;
  assert.equal(detail.fotos.length, 5); assert.equal(detail.fotos[0].url, first.data.data.url);
  assert.equal((await one('SELECT COUNT(*) AS total FROM donacion_fotos WHERE id_donacion = ? AND es_principal = 1', [d.id_donacion])).total, 1);
  assert.equal((await storedFiles()).filter(name => name.startsWith(`donacion_${d.id_donacion}_`)).length, 5);
});

test('Fotografías: exige sesión, CSRF, donante verificado y propiedad', async () => {
  const account = await donor(), other = await donor(), d = await donation(account);
  assert.equal((await upload(d.id_donacion, null)).status, 401);
  assert.equal((await upload(d.id_donacion, account, png, 'image/png', { 'x-csrf-token': '' })).status, 403);
  assert.equal((await upload(d.id_donacion, accounts.organizacion)).status, 403);
  assert.equal((await upload(d.id_donacion, accounts.admin)).status, 403);
  assert.equal((await upload(d.id_donacion, other)).status, 403);
  await db.query("UPDATE donantes SET estado_verificacion = 'pendiente' WHERE id_usuario = ?", [account.user.id_usuario]);
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

test('Fotografías: si falla MySQL o el disco no queda archivo huérfano ni registro parcial', async () => {
  const account = await donor(), d = await donation(account);
  assert.equal((await upload(d.id_donacion, account)).status, 201);
  const before = await storedFiles();
  // Disparador solo en la instancia temporal: simula que MySQL rechaza los metadatos tras escribir el archivo.
  const admin = await sandbox.connect();
  await admin.query(`CREATE TRIGGER prueba_fallo_foto BEFORE INSERT ON donacion_fotos FOR EACH ROW
    BEGIN IF NEW.nombre_original = 'fallo-simulado.png' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fallo simulado'; END IF; END`);
  try {
    const failed = await upload(d.id_donacion, account, png, 'image/png', { 'x-file-name': 'fallo-simulado.png' });
    assert.equal(failed.status, 500); assert.equal(failed.data.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(failed.data), /Fallo simulado|SQL/);
    assert.deepEqual(await storedFiles(), before);
    assert.equal((await one('SELECT COUNT(*) AS total FROM donacion_fotos WHERE id_donacion = ?', [d.id_donacion])).total, 1);
  } finally { await admin.query('DROP TRIGGER prueba_fallo_foto'); await admin.end(); }
  // Carpeta no disponible: no se registra la fotografía en MySQL.
  const moved = `${sandbox.uploads}-movida`;
  await rename(sandbox.uploads, moved);
  await writeFile(sandbox.uploads, 'no es una carpeta');
  try {
    const failed = await upload(d.id_donacion, account);
    assert.equal(failed.status, 500);
    assert.equal((await one('SELECT COUNT(*) AS total FROM donacion_fotos WHERE id_donacion = ?', [d.id_donacion])).total, 1);
  } finally { await rm(sandbox.uploads, { force: true }); await rename(moved, sandbox.uploads); }
  assert.equal((await upload(d.id_donacion, account)).status, 201);
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
  assert.equal((await media('/media/donaciones/..%2F..%2F.env', account)).status, 404);
  await db.query("UPDATE donantes SET estado_verificacion = 'pendiente' WHERE id_usuario = ?", [account.user.id_usuario]);
  assert.equal((await media(url, accounts.organizacion)).status, 404);
});

test('Fotografías privadas: vencida no es catálogo; organización con solicitud propia conserva acceso', async () => {
  const account = await donor(), d = await donation(account);
  const uploaded = await upload(d.id_donacion, account); assert.equal(uploaded.status, 201);
  await request(d.id_donacion);
  await db.query('UPDATE donaciones SET fecha_disponibilidad = NOW() - INTERVAL 3 HOUR, fecha_limite_recojo = NOW() - INTERVAL 1 HOUR WHERE id_donacion = ?', [d.id_donacion]);
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
  const delivery = await one('SELECT id_entrega FROM entregas WHERE id_solicitud = ?', [s.id_solicitud]);
  const response = await call('GET', `/api/seguimiento/${delivery.id_entrega}`, undefined, accounts.organizacion);
  assert.equal(response.status, 200); assert.equal(response.data.data.fotos[0].url, uploaded.data.data.url);
  assert.equal(response.data.data.donacion.fotos[0].url, uploaded.data.data.url);
  assert.equal((await media(uploaded.data.data.url, accounts.organizacion)).status, 200);
  assert.equal((await media(uploaded.data.data.url, accounts.organizacion2)).status, 404);
});
