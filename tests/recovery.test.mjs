import 'dotenv/config';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const originalUrl = process.env.DATABASE_URL;
const originalEnvironment = process.env.NODE_ENV;
const databaseName = `realimenta_recovery_test_${process.pid}_${randomBytes(4).toString('hex')}`;
const oldPassword = 'RecuperacionPrueba2026!';
const newPassword = 'ClaveNuevaSegura2026!';
const digest = value => createHash('sha256').update(value).digest('hex');
let adminPool, pool, server, baseUrl, hashPassword, verifyPassword, fixtureCount = 0, initialHash;

async function call(path, body, headers = {}, method = 'POST') {
  const response = await fetch(`${baseUrl}/api/auth${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, response, data: await response.json() };
}
async function fixture(rol = 'donante', esDemostracion = true, estado = 'activo') {
  return (await pool.query(`INSERT INTO usuario(nombre,correo,hash_contrasena,telefono,rol,es_demostracion,estado)
    VALUES($1,$2,$3,'000000000',$4,$5,$6) RETURNING *`, [`Recuperación prueba ${++fixtureCount}`, `recuperacion-${fixtureCount}@realimenta.test`, initialHash, rol, esDemostracion, estado])).rows[0];
}
async function requestCode(user) {
  const result = await call('/recuperacion/solicitar', { correo: user.correo });
  assert.equal(result.status, 200);
  assert.match(result.data.data.demo?.codigo || '', /^[a-f0-9]{64}$/);
  return result.data.data.demo.codigo;
}
async function reset(user, codigo, contrasena = newPassword) {
  return call('/recuperacion/restablecer', { correo: user.correo, codigo, contrasena });
}
async function injectedCode(user) {
  const code = randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO recuperacion_contrasena(id_usuario,hash_codigo,fecha_expiracion) VALUES($1,$2,now()+interval '10 minutes')`, [user.id_usuario, digest(code)]);
  return code;
}

before(async () => {
  assert.ok(originalUrl, 'Configure DATABASE_URL para probar recuperación con PostgreSQL real.');
  adminPool = new pg.Pool({ connectionString: originalUrl });
  assert.match(databaseName, /^realimenta_recovery_test_\d+_[a-f0-9]+$/);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(originalUrl); url.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = 'test';
  await execute(process.execPath, ['scripts/migrate.mjs'], { env: { ...process.env } });
  ({ pool } = await import('../server/db.js'));
  const auth = await import('../server/auth.js');
  ({ hashPassword, verifyPassword } = auth);
  const { recoveryRouter } = await import('../server/recovery.js');
  const { errorHandler } = await import('../server/errors.js');
  initialHash = await hashPassword(oldPassword);
  const app = express();
  app.use(express.json());
  app.use('/api', auth.checkOrigin, auth.loadSession, auth.csrf);
  app.use('/api/auth', auth.authRouter, recoveryRouter);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  if (adminPool) {
    if (/^realimenta_recovery_test_\d+_[a-f0-9]+$/.test(databaseName)) await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await adminPool.end();
  }
  if (originalUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalUrl;
  if (originalEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnvironment;
});

test('Recuperación: respuesta genérica sin token para correo inexistente, cuenta real, administrador e inactiva', async () => {
  const users = [await fixture('donante', false), await fixture('organizacion', false), await fixture('administrador'), await fixture('donante', true, 'inactivo')];
  const missing = await call('/recuperacion/solicitar', { correo: 'nadie@no-existe.test' });
  assert.equal(missing.status, 200); assert.equal(missing.data.data.demo, undefined);
  for (const user of users) {
    const result = await call('/recuperacion/solicitar', { correo: user.correo });
    assert.deepEqual(result.data, missing.data);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM recuperacion_contrasena WHERE id_usuario=$1', [user.id_usuario])).rows[0].total, 0);
  }
  assert.equal((await call('/recuperacion/solicitar', { correo: 'correo-invalido' })).status, 422);
});

test('Recuperación demo donante y organización: código fuerte, hash PG y expiración de diez minutos', async () => {
  for (const rol of ['donante', 'organizacion']) {
    const user = await fixture(rol);
    const result = await call('/recuperacion/solicitar', { correo: user.correo });
    const { codigo, expira_en_minutos } = result.data.data.demo;
    assert.match(codigo, /^[a-f0-9]{64}$/); assert.equal(expira_en_minutos, 10);
    const token = (await pool.query('SELECT *,extract(epoch FROM (fecha_expiracion-fecha_creacion)) AS segundos FROM recuperacion_contrasena WHERE id_usuario=$1', [user.id_usuario])).rows[0];
    assert.equal(token.hash_codigo, digest(codigo)); assert.notEqual(token.hash_codigo, codigo);
    assert.ok(Math.abs(Number(token.segundos) - 600) < 1);
    assert.equal(token.fecha_uso, null); assert.equal(token.fecha_invalidacion, null);
    const events = (await pool.query('SELECT detalle FROM auditoria WHERE id_usuario=$1', [user.id_usuario])).rows;
    assert.ok(!JSON.stringify(events).includes(codigo));
  }
});

test('Recuperación: código inválido o ausente no cambia la contraseña; contraseña débil no consume código', async () => {
  const user = await fixture(), code = await requestCode(user);
  assert.equal((await reset(user, randomBytes(32).toString('hex'))).status, 400);
  assert.equal((await reset(user, '')).status, 400);
  assert.equal((await reset(user, code, 'corta')).status, 422);
  const row = (await pool.query('SELECT hash_contrasena FROM usuario WHERE id_usuario=$1', [user.id_usuario])).rows[0];
  assert.equal(row.hash_contrasena, initialHash);
  assert.equal((await pool.query('SELECT fecha_uso FROM recuperacion_contrasena WHERE hash_codigo=$1', [digest(code)])).rows[0].fecha_uso, null);
});

test('Recuperación: código vencido según PostgreSQL no restablece', async () => {
  const user = await fixture(), code = await requestCode(user);
  await pool.query(`UPDATE recuperacion_contrasena SET fecha_creacion=now()-interval '11 minutes',fecha_expiracion=now()-interval '1 minute' WHERE hash_codigo=$1`, [digest(code)]);
  const result = await reset(user, code);
  assert.equal(result.status, 400); assert.equal(result.data.error.code, 'RECOVERY_INVALID');
  assert.equal((await pool.query('SELECT hash_contrasena FROM usuario WHERE id_usuario=$1', [user.id_usuario])).rows[0].hash_contrasena, initialHash);
});

test('Recuperación: emitir otro código invalida el previo y conserva solo uno pendiente', async () => {
  const user = await fixture(), first = await requestCode(user), second = await requestCode(user);
  assert.notEqual(first, second);
  assert.equal((await reset(user, first)).status, 400);
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM recuperacion_contrasena WHERE id_usuario=$1 AND fecha_uso IS NULL AND fecha_invalidacion IS NULL', [user.id_usuario])).rows[0].total, 1);
  assert.equal((await reset(user, second)).status, 200);
});

test('Recuperación: cambia hash scrypt, revoca todas las sesiones, uso único y no inicia sesión', async () => {
  const user = await fixture('organizacion');
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const login = await call('/login', { correo: user.correo, contrasena: oldPassword });
    assert.equal(login.status, 200);
    sessions.push(login.response.headers.get('set-cookie').split(';')[0]);
  }
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM sesion WHERE id_usuario=$1', [user.id_usuario])).rows[0].total, 2);
  const code = await requestCode(user);
  const result = await reset(user, code);
  assert.equal(result.status, 200); assert.equal(result.data.user, undefined);
  assert.match(result.response.headers.get('set-cookie'), /realimenta_session=;/);
  const changedHash = (await pool.query('SELECT hash_contrasena FROM usuario WHERE id_usuario=$1', [user.id_usuario])).rows[0].hash_contrasena;
  assert.match(changedHash, /^scrypt\$/); assert.notEqual(changedHash, initialHash);
  assert.equal(await verifyPassword(newPassword, changedHash), true);
  assert.equal(await verifyPassword(oldPassword, changedHash), false);
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM sesion WHERE id_usuario=$1', [user.id_usuario])).rows[0].total, 0);
  for (const Cookie of sessions) assert.equal((await call('/me', undefined, { Cookie }, 'GET')).status, 401);
  assert.equal((await reset(user, code)).status, 400);
  assert.equal((await call('/login', { correo: user.correo, contrasena: oldPassword })).status, 401);
  assert.equal((await call('/login', { correo: user.correo, contrasena: newPassword })).status, 200);
  const events = (await pool.query("SELECT detalle FROM auditoria WHERE id_usuario=$1 AND accion='restablecer_contrasena_demo'", [user.id_usuario])).rows;
  assert.equal(events.length, 1); assert.equal(events[0].detalle.sesiones_revocadas, 2);
  assert.ok(!JSON.stringify(events).includes(newPassword)); assert.ok(!JSON.stringify(events).includes(code));
});

test('Recuperación: dos restablecimientos simultáneos del mismo código solo permiten uno', async () => {
  const user = await fixture(), code = await requestCode(user);
  const results = await Promise.all([reset(user, code, 'ClaveParalelaPrimera2026!'), reset(user, code, 'ClaveParalelaSegunda2026!')]);
  assert.deepEqual(results.map(value => value.status).sort(), [200, 400]);
  assert.equal((await pool.query("SELECT count(*)::int AS total FROM auditoria WHERE id_usuario=$1 AND accion='restablecer_contrasena_demo'", [user.id_usuario])).rows[0].total, 1);
});

test('Recuperación: ni cuentas reales ni administrador se restablecen incluso con token inyectado en prueba', async () => {
  for (const user of [await fixture('donante', false), await fixture('organizacion', false), await fixture('administrador')]) {
    const code = await injectedCode(user);
    assert.equal((await reset(user, code)).status, 400);
    assert.equal((await pool.query('SELECT hash_contrasena FROM usuario WHERE id_usuario=$1', [user.id_usuario])).rows[0].hash_contrasena, initialHash);
  }
});

test('Recuperación: en producción no emite ni acepta códigos demo', async () => {
  const user = await fixture(), code = await requestCode(user);
  process.env.NODE_ENV = 'production';
  try {
    const request = await call('/recuperacion/solicitar', { correo: user.correo });
    assert.equal(request.status, 200); assert.equal(request.data.data.demo, undefined);
    assert.equal((await reset(user, code)).status, 400);
    assert.equal((await pool.query('SELECT hash_contrasena FROM usuario WHERE id_usuario=$1', [user.id_usuario])).rows[0].hash_contrasena, initialHash);
  } finally { process.env.NODE_ENV = 'test'; }
});

test('Recuperación: comprobación Origin y límites por correo para solicitud y restablecimiento', async () => {
  const user = await fixture();
  assert.equal((await call('/recuperacion/solicitar', { correo: user.correo }, { Origin: 'https://externo.example' })).status, 403);
  for (let i = 0; i < 5; i++) assert.equal((await call('/recuperacion/solicitar', { correo: user.correo })).status, 200);
  const limited = await call('/recuperacion/solicitar', { correo: user.correo });
  assert.equal(limited.status, 429); assert.equal(limited.data.error.code, 'RECOVERY_RATE_LIMIT');
  const wrongCode = randomBytes(32).toString('hex');
  for (let i = 0; i < 10; i++) assert.equal((await reset(user, wrongCode)).status, 400);
  assert.equal((await reset(user, wrongCode)).status, 429);
});
