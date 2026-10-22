import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { startSandbox } from './helpers/mysql-sandbox.mjs';

const originalEnvironment = process.env.NODE_ENV;
const oldPassword = 'RecuperacionPrueba2026!';
const newPassword = 'ClaveNuevaSegura2026!';
let sandbox, db, pool, server, baseUrl, hashPassword, verifyPassword, recovery, fixtureCount = 0, initialHash;
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const auditOf = async (userId, action) => (await db.query('SELECT descripcion FROM auditoria WHERE id_usuario = ? AND accion = ?', [userId, action])).rows;

async function call(path, body, headers = {}, method = 'POST') {
  const response = await fetch(`${baseUrl}/api/auth${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, response, data: await response.json() };
}
// Cuentas demo usan el dominio reservado @realimenta.test; las "reales" usan otro dominio.
async function fixture(rol = 'donante', demo = true, estado = 'activo') {
  const correo = `recuperacion-${++fixtureCount}@${demo ? 'realimenta.test' : 'real.example'}`;
  const created = await db.query('INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES (?, ?, ?, ?, ?, ?)', [`Recuperación prueba ${fixtureCount}`, correo, initialHash, '000000000', rol, estado]);
  return one('SELECT * FROM usuarios WHERE id_usuario = ?', [created.insertId]);
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
const currentHash = async user => (await one('SELECT password_hash FROM usuarios WHERE id_usuario = ?', [user.id_usuario])).password_hash;

before(async () => {
  sandbox = await startSandbox();
  process.env.NODE_ENV = 'test';
  ({ db, pool } = await import('../server/db.js'));
  const auth = await import('../server/auth.js');
  ({ hashPassword, verifyPassword } = auth);
  recovery = await import('../server/recovery.js');
  const { errorHandler } = await import('../server/errors.js');
  initialHash = await hashPassword(oldPassword);
  const app = express();
  app.use(express.json());
  app.use('/api', auth.checkOrigin, auth.loadSession, auth.csrf);
  app.use('/api/auth', auth.authRouter, recovery.recoveryRouter);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  if (sandbox) await sandbox.stop();
  if (originalEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnvironment;
});

test('Recuperación: respuesta genérica sin código para correo inexistente, cuenta real, administrador y suspendida', async () => {
  const users = [await fixture('donante', false), await fixture('organizacion', false), await fixture('administrador'), await fixture('donante', true, 'suspendido')];
  const missing = await call('/recuperacion/solicitar', { correo: 'nadie@no-existe.test' });
  assert.equal(missing.status, 200); assert.equal(missing.data.data.demo, undefined);
  for (const user of users) {
    const result = await call('/recuperacion/solicitar', { correo: user.correo });
    assert.deepEqual(result.data, missing.data);
    assert.equal((await auditOf(user.id_usuario, 'solicitar_recuperacion_demo')).length, 0);
  }
  assert.equal((await call('/recuperacion/solicitar', { correo: 'correo-invalido' })).status, 422);
});

test('Recuperación demo donante y organización: código fuerte de diez minutos que no se guarda en claro', async () => {
  for (const rol of ['donante', 'organizacion']) {
    const user = await fixture(rol);
    const result = await call('/recuperacion/solicitar', { correo: user.correo });
    const { codigo, expira_en_minutos } = result.data.data.demo;
    assert.match(codigo, /^[a-f0-9]{64}$/); assert.equal(expira_en_minutos, 10);
    const events = await auditOf(user.id_usuario, 'solicitar_recuperacion_demo');
    assert.equal(events.length, 1); assert.ok(!JSON.stringify(events).includes(codigo));
    assert.equal(JSON.parse(events[0].descripcion).expira_en_minutos, 10);
  }
});

test('Recuperación: código inválido o ausente no cambia la contraseña; contraseña débil no consume código', async () => {
  const user = await fixture(), code = await requestCode(user);
  assert.equal((await reset(user, randomBytes(32).toString('hex'))).status, 400);
  assert.equal((await reset(user, '')).status, 400);
  assert.equal((await reset(user, code, 'corta')).status, 422);
  assert.equal(await currentHash(user), initialHash);
  assert.equal((await reset(user, code)).status, 200);
});

test('Recuperación: código vencido no restablece', async () => {
  const user = await fixture(), code = await requestCode(user);
  recovery.expireRecoveryCode(user.id_usuario);
  const result = await reset(user, code);
  assert.equal(result.status, 400); assert.equal(result.data.error.code, 'RECOVERY_INVALID');
  assert.equal(await currentHash(user), initialHash);
});

test('Recuperación: emitir otro código invalida el previo y conserva solo uno vigente', async () => {
  const user = await fixture(), first = await requestCode(user), second = await requestCode(user);
  assert.notEqual(first, second);
  assert.equal((await reset(user, first)).status, 400);
  assert.equal((await reset(user, second)).status, 200);
});

test('Recuperación: cambiar la contraseña por otra vía invalida un código emitido antes', async () => {
  const user = await fixture(), code = await requestCode(user);
  await db.query('UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?', [await hashPassword('OtraClaveCambiada2026!'), user.id_usuario]);
  assert.equal((await reset(user, code)).status, 400);
});

test('Recuperación: cambia hash scrypt en usuarios, revoca todas las sesiones, uso único y no inicia sesión', async () => {
  const user = await fixture('organizacion');
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const login = await call('/login', { correo: user.correo, contrasena: oldPassword });
    assert.equal(login.status, 200);
    sessions.push(login.response.headers.get('set-cookie').split(';')[0]);
  }
  for (const Cookie of sessions) assert.equal((await call('/me', undefined, { Cookie }, 'GET')).status, 200);
  const code = await requestCode(user);
  const result = await reset(user, code);
  assert.equal(result.status, 200); assert.equal(result.data.user, undefined);
  assert.match(result.response.headers.get('set-cookie'), /realimenta_session=;/);
  const changedHash = await currentHash(user);
  assert.match(changedHash, /^scrypt\$/); assert.notEqual(changedHash, initialHash);
  assert.equal(await verifyPassword(newPassword, changedHash), true);
  assert.equal(await verifyPassword(oldPassword, changedHash), false);
  for (const Cookie of sessions) assert.equal((await call('/me', undefined, { Cookie }, 'GET')).status, 401);
  assert.equal((await reset(user, code)).status, 400);
  assert.equal((await call('/login', { correo: user.correo, contrasena: oldPassword })).status, 401);
  assert.equal((await call('/login', { correo: user.correo, contrasena: newPassword })).status, 200);
  const events = await auditOf(user.id_usuario, 'restablecer_contrasena_demo');
  assert.equal(events.length, 1); assert.equal(JSON.parse(events[0].descripcion).sesiones_revocadas, 'todas');
  assert.ok(!JSON.stringify(events).includes(newPassword)); assert.ok(!JSON.stringify(events).includes(code));
});

test('Recuperación: dos restablecimientos simultáneos del mismo código solo permiten uno', async () => {
  const user = await fixture(), code = await requestCode(user);
  const results = await Promise.all([reset(user, code, 'ClaveParalelaPrimera2026!'), reset(user, code, 'ClaveParalelaSegunda2026!')]);
  assert.deepEqual(results.map(value => value.status).sort(), [200, 400]);
  assert.equal((await auditOf(user.id_usuario, 'restablecer_contrasena_demo')).length, 1);
});

test('Recuperación: ni cuentas reales ni administrador se restablecen incluso con código emitido internamente', async () => {
  for (const user of [await fixture('donante', false), await fixture('organizacion', false), await fixture('administrador')]) {
    const code = recovery.issueRecoveryCode(user);
    assert.equal((await reset(user, code)).status, 400);
    assert.equal(await currentHash(user), initialHash);
  }
});

test('Recuperación: en producción no emite ni acepta códigos demo', async () => {
  const user = await fixture(), code = await requestCode(user);
  process.env.NODE_ENV = 'production';
  try {
    const request = await call('/recuperacion/solicitar', { correo: user.correo });
    assert.equal(request.status, 200); assert.equal(request.data.data.demo, undefined);
    assert.equal((await reset(user, code)).status, 400);
    assert.equal(await currentHash(user), initialHash);
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
