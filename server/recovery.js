import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { transaction, audit } from './db.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';
import { fail } from './errors.js';
import { text } from './validation.js';

const EXPIRATION_MINUTES = 10;
const GENERIC_MESSAGE = 'Si la cuenta admite recuperación, se preparó la solicitud. Este MVP solo simula el proceso para cuentas de demostración; no envía correos reales.';
const INVALID_MESSAGE = 'El código no es válido o ha vencido. Solicita uno nuevo.';
const digest = value => createHash('sha256').update(value).digest('hex');
const demoEnabled = () => !config.production && process.env.NODE_ENV !== 'production';
const eligible = user => demoEnabled() && user?.es_demostracion === true && user.estado === 'activo' && ['donante', 'organizacion'].includes(user.rol);

// Contadores defensivos de una instancia. Tokens, uso único y sesiones persisten en PG.
const limits = new Map();
function limit(key, maximum) {
  const now = Date.now();
  let entry = limits.get(key);
  if (!entry || entry.until <= now) {
    entry = { count: 0, until: now + 15 * 60_000 };
    limits.set(key, entry);
  }
  if (++entry.count > maximum) fail(429, 'RECOVERY_RATE_LIMIT', 'Demasiados intentos de recuperación. Espera 15 minutos antes de reintentar.');
  if (limits.size > 5000) {
    for (const [storedKey, value] of limits) if (value.until <= now) limits.delete(storedKey);
    if (limits.size > 5000) limits.delete(limits.keys().next().value);
  }
}
function email(value) {
  const correo = text(value, 'correo', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fail(422, 'INVALID_EMAIL', 'Ingresa un correo válido.');
  return correo;
}
function guard(req, correo, action) {
  limit(`${action}:ip:${req.ip}`, action === 'request' ? 40 : 60);
  // No conservar el correo en texto en el contador de memoria.
  limit(`${action}:email:${digest(correo)}`, action === 'request' ? 5 : 10);
}

export const recoveryRouter = Router();
recoveryRouter.post('/recuperacion/solicitar', async (req, res) => {
  const correo = email(req.body.correo);
  guard(req, correo, 'request');
  let demo;
  if (demoEnabled()) {
    demo = await transaction(async client => {
      const user = (await client.query('SELECT * FROM usuario WHERE lower(correo)=$1 FOR UPDATE', [correo])).rows[0];
      // No emitir tokens para usuarios reales, administradores, inactivos o correos inexistentes.
      if (!eligible(user)) return undefined;
      const codigo = randomBytes(32).toString('hex');
      await client.query(`UPDATE recuperacion_contrasena SET fecha_invalidacion=now()
        WHERE id_usuario=$1 AND fecha_uso IS NULL AND fecha_invalidacion IS NULL`, [user.id_usuario]);
      await client.query(`INSERT INTO recuperacion_contrasena(id_usuario,hash_codigo,fecha_expiracion)
        VALUES($1,$2,now()+interval '10 minutes')`, [user.id_usuario, digest(codigo)]);
      await audit(client, user.id_usuario, 'usuario', user.id_usuario, 'solicitar_recuperacion_demo', { modo: 'simulacion_local', expira_en_minutos: EXPIRATION_MINUTES });
      return { codigo, expira_en_minutos: EXPIRATION_MINUTES };
    });
  }
  res.json({ data: { message: GENERIC_MESSAGE, ...(demo ? { demo } : {}) } });
});

recoveryRouter.post('/recuperacion/restablecer', async (req, res) => {
  const correo = email(req.body.correo);
  guard(req, correo, 'reset');
  const codigo = typeof req.body.codigo === 'string' ? req.body.codigo.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{64}$/.test(codigo)) fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
  const password = req.body.contrasena;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    fail(422, 'INVALID_PASSWORD', 'La nueva contraseña debe contener entre 12 y 128 caracteres.');
  if (!demoEnabled()) fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
  await transaction(async client => {
    const user = (await client.query('SELECT * FROM usuario WHERE lower(correo)=$1 FOR UPDATE', [correo])).rows[0];
    if (!eligible(user)) fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
    const token = (await client.query(`SELECT id_recuperacion FROM recuperacion_contrasena
      WHERE id_usuario=$1 AND hash_codigo=$2 AND fecha_uso IS NULL AND fecha_invalidacion IS NULL
      AND fecha_expiracion>now() FOR UPDATE`, [user.id_usuario, digest(codigo)])).rows[0];
    if (!token) fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
    const hash = await hashPassword(password);
    await client.query('UPDATE usuario SET hash_contrasena=$2 WHERE id_usuario=$1', [user.id_usuario, hash]);
    await client.query('UPDATE recuperacion_contrasena SET fecha_uso=now() WHERE id_recuperacion=$1', [token.id_recuperacion]);
    await client.query(`UPDATE recuperacion_contrasena SET fecha_invalidacion=now()
      WHERE id_usuario=$1 AND id_recuperacion<>$2 AND fecha_uso IS NULL AND fecha_invalidacion IS NULL`, [user.id_usuario, token.id_recuperacion]);
    const revoked = await client.query('DELETE FROM sesion WHERE id_usuario=$1', [user.id_usuario]);
    await audit(client, user.id_usuario, 'usuario', user.id_usuario, 'restablecer_contrasena_demo', { modo: 'simulacion_local', sesiones_revocadas: revoked.rowCount });
  });
  res.clearCookie('realimenta_session', { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' });
  res.json({ data: { message: 'Contraseña actualizada. Las sesiones anteriores se cerraron. Inicia sesión con la nueva contraseña.' } });
});
