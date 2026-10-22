import { Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { transaction, audit } from './db.js';
import { hashPassword, passwordFingerprint, canSignIn, isDemoEmail, cookieOptions } from './auth.js';
import { config } from './config.js';
import { fail } from './errors.js';
import { text } from './validation.js';

const EXPIRATION_MINUTES = 10;
const GENERIC_MESSAGE = 'Si la cuenta admite recuperación, se preparó la solicitud. Este MVP solo simula el proceso para cuentas de demostración; no envía correos reales.';
const INVALID_MESSAGE = 'El código no es válido o ha vencido. Solicita uno nuevo.';
const digest = value => createHash('sha256').update(value).digest('hex');
const demoEnabled = () => !config.production && process.env.NODE_ENV !== 'production';
const eligible = user => demoEnabled() && Boolean(user) && isDemoEmail(user.correo) && canSignIn(user.estado) && ['donante', 'organizacion'].includes(user.rol);

// El esquema MySQL no tiene tabla de recuperación. Como la recuperación es una simulación local para
// cuentas de demostración, el código vive en memoria del servidor: un solo código vigente por usuario,
// solo su hash, vencimiento de 10 minutos y ligado a la contraseña actual (deja de valer al cambiarla).
const codes = new Map();
export function issueRecoveryCode(user) {
  const codigo = randomBytes(32).toString('hex');
  codes.set(user.id_usuario, { hash: digest(codigo), until: Date.now() + EXPIRATION_MINUTES * 60_000, fingerprint: passwordFingerprint(user.password_hash) });
  if (codes.size > 5000) { const now = Date.now(); for (const [key, value] of codes) if (value.until <= now) codes.delete(key); }
  return codigo;
}
export function expireRecoveryCode(userId) {
  const entry = codes.get(userId);
  if (entry) entry.until = Date.now() - 1;
}
function consumeCode(user, codigo) {
  const entry = codes.get(user.id_usuario);
  const valid = entry && entry.until > Date.now() && timingSafeEqual(Buffer.from(entry.hash), Buffer.from(digest(codigo))) && entry.fingerprint === passwordFingerprint(user.password_hash);
  if (!valid) return false;
  codes.delete(user.id_usuario);
  return true;
}

// Contadores defensivos de una instancia.
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
      const user = (await client.query('SELECT * FROM usuarios WHERE correo = ? FOR UPDATE', [correo])).rows[0];
      // No emitir códigos para usuarios reales, administradores, suspendidos o correos inexistentes.
      if (!eligible(user)) return undefined;
      const codigo = issueRecoveryCode(user);
      await audit(client, user.id_usuario, 'usuarios', user.id_usuario, 'solicitar_recuperacion_demo', { modo: 'simulacion_local', expira_en_minutos: EXPIRATION_MINUTES });
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
  const hash = await hashPassword(password);
  await transaction(async client => {
    // El bloqueo de la fila serializa restablecimientos simultáneos: el segundo ya no encuentra el código.
    const user = (await client.query('SELECT * FROM usuarios WHERE correo = ? FOR UPDATE', [correo])).rows[0];
    if (!eligible(user) || !consumeCode(user, codigo)) fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
    await client.query('UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?', [hash, user.id_usuario]);
    // Las sesiones firmadas incluyen la huella de password_hash: al cambiarla quedan todas revocadas.
    await audit(client, user.id_usuario, 'usuarios', user.id_usuario, 'restablecer_contrasena_demo', { modo: 'simulacion_local', sesiones_revocadas: 'todas' });
  }, { retries: 0 });
  res.clearCookie('realimenta_session', cookieOptions);
  res.json({ data: { message: 'Contraseña actualizada. Las sesiones anteriores se cerraron. Inicia sesión con la nueva contraseña.' } });
});
