import { Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { transaction, audit } from './db.js';
import { hashPassword, passwordFingerprint, canSignIn, isDemoEmail, cookieOptions } from './auth.js';
import { config } from './config.js';
import { fail } from './errors.js';
import { text, password as passwordRule } from './validation.js';

const EXPIRATION_MINUTES = 10;
const GENERIC_MESSAGE = 'Si la cuenta admite recuperación y el correo está configurado, recibirás un código. Las cuentas de demostración muestran su código en esta página.';
const INVALID_MESSAGE = 'El código no es válido o ha vencido. Solicita uno nuevo.';
const digest = value => createHash('sha256').update(value).digest('hex');
const demoEnabled = () => !config.production && process.env.NODE_ENV !== 'production';
const eligible = user => demoEnabled() && Boolean(user) && isDemoEmail(user.correo) && canSignIn(user.estado) && ['donante', 'organizacion'].includes(user.rol);
const eligibleReal = user => Boolean(user) && !isDemoEmail(user.correo) && canSignIn(user.estado) && ['donante', 'organizacion'].includes(user.rol);
function smtpOptions() {
  const host = process.env.SMTP_HOST?.trim(), from = process.env.SMTP_FROM?.trim(), port = Number(process.env.SMTP_PORT || 587);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535 || /[\r\n]/.test(from)) return null;
  const user = process.env.SMTP_USER || '', pass = process.env.SMTP_PASSWORD || '';
  if (Boolean(user) !== Boolean(pass)) return null;
  const secure = process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE !== 'false' && port === 465);
  const requireTLS = !secure && (config.production || process.env.SMTP_REQUIRE_TLS !== 'false');
  // Las conexiones sin TLS solo se admiten contra el servidor local durante pruebas o desarrollo.
  if (!secure && !requireTLS && !['127.0.0.1', 'localhost', '::1'].includes(host)) return null;
  return { from, transport: { host, port, secure, requireTLS, ...(user ? { auth: { user, pass } } : {}), connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 } };
}

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
  const smtp = smtpOptions();
  const result = await transaction(async client => {
    const user = (await client.query('SELECT * FROM usuarios WHERE correo = ? FOR UPDATE', [correo])).rows[0];
    if (eligible(user)) {
      const codigo = issueRecoveryCode(user);
      await audit(client, user.id_usuario, 'usuarios', user.id_usuario, 'solicitar_recuperacion_demo', { modo: 'simulacion_local', expira_en_minutos: EXPIRATION_MINUTES });
      return { demo: { codigo, expira_en_minutos: EXPIRATION_MINUTES } };
    }
    if (!smtp || !eligibleReal(user)) return {};
    const codigo = randomBytes(32).toString('hex'), tokenHash = digest(codigo);
    await client.query(`INSERT INTO recuperacion_contrasenas (id_usuario, token_hash, password_huella, vence) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
      ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), password_huella = VALUES(password_huella), vence = VALUES(vence), creado = CURRENT_TIMESTAMP`, [user.id_usuario, tokenHash, digest(user.password_hash)]);
    await audit(client, user.id_usuario, 'usuarios', user.id_usuario, 'solicitar_recuperacion_correo', { expira_en_minutos: EXPIRATION_MINUTES });
    return { email: { codigo, tokenHash, id_usuario: user.id_usuario, correo: user.correo } };
  });
  if (result.email) {
    try {
      await nodemailer.createTransport(smtp.transport).sendMail({ from: smtp.from, to: result.email.correo, subject: 'Código para recuperar tu cuenta de REAlimenta', text: `Solicitaste recuperar tu cuenta de REAlimenta.\n\nPega este código en la página de recuperación:\n${result.email.codigo}\n\nEl código vence en ${EXPIRATION_MINUTES} minutos y solo puede usarse una vez. Si no lo solicitaste, ignora este mensaje. No compartas el código.` });
    } catch {
      // Solo se revoca este código: una solicitud más reciente podría haberlo reemplazado.
      await transaction(client => client.query('DELETE FROM recuperacion_contrasenas WHERE id_usuario = ? AND token_hash = ?', [result.email.id_usuario, result.email.tokenHash]));
      console.error('No se pudo entregar un código de recuperación por correo.');
    }
  }
  res.json({ data: { message: GENERIC_MESSAGE, ...(result.demo ? { demo: result.demo } : {}) } });
});

recoveryRouter.post('/recuperacion/restablecer', async (req, res) => {
  const correo = email(req.body.correo);
  guard(req, correo, 'reset');
  const codigo = typeof req.body.codigo === 'string' ? req.body.codigo.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{64}$/.test(codigo)) fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
  const password = passwordRule(req.body.contrasena);
  const hash = await hashPassword(password);
  await transaction(async client => {
    // El bloqueo de la fila serializa restablecimientos simultáneos: el segundo ya no encuentra el código.
    const user = (await client.query('SELECT * FROM usuarios WHERE correo = ? FOR UPDATE', [correo])).rows[0];
    let mode;
    if (eligible(user) && consumeCode(user, codigo)) mode = 'demo';
    else if (eligibleReal(user)) {
      const row = (await client.query('SELECT *, (vence > NOW()) AS vigente FROM recuperacion_contrasenas WHERE id_usuario = ? FOR UPDATE', [user.id_usuario])).rows[0];
      const valid = row?.vigente && typeof row.token_hash === 'string' && row.token_hash.length === 64 && timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(digest(codigo))) && row.password_huella === digest(user.password_hash);
      if (!valid) fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
      await client.query('DELETE FROM recuperacion_contrasenas WHERE id_usuario = ?', [user.id_usuario]);
      mode = 'correo';
    } else fail(400, 'RECOVERY_INVALID', INVALID_MESSAGE);
    await client.query('UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?', [hash, user.id_usuario]);
    // Las sesiones firmadas incluyen la huella de password_hash: al cambiarla quedan todas revocadas.
    await audit(client, user.id_usuario, 'usuarios', user.id_usuario, mode === 'demo' ? 'restablecer_contrasena_demo' : 'restablecer_contrasena_correo', { modo: mode, sesiones_revocadas: 'todas' });
  }, { retries: 0 });
  res.clearCookie('realimenta_session', cookieOptions);
  res.json({ data: { message: 'Contraseña actualizada. Las sesiones anteriores se cerraron. Inicia sesión con la nueva contraseña.' } });
});
