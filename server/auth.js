import { randomBytes, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { db, transaction, audit } from './db.js';
import { config } from './config.js';
import { fail } from './errors.js';
import { text, profileInput } from './validation.js';
import { donorProfile, organizationProfile } from './mappers.js';

const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  try {
    const [type, n, r, p, salt, digest] = encoded.split('$');
    if (type !== 'scrypt') return false;
    const actual = await scrypt(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) });
    const expected = Buffer.from(digest, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

// "pendiente" es el estado inicial de usuarios en MySQL: permite consultar el perfil mientras se verifica.
// "suspendido" bloquea el acceso.
export const canSignIn = estado => estado === 'activo' || estado === 'pendiente';
export const isDemoEmail = correo => String(correo || '').toLowerCase().endsWith(`@${config.demoEmailDomain}`);
export const fullName = row => [row?.nombres, row?.apellidos].map(value => String(value || '').trim()).filter(Boolean).join(' ');

// Sesiones firmadas con HMAC. El esquema MySQL no incluye tabla de sesiones, así que la cookie
// lleva usuario, vencimiento y una huella de password_hash: cambiar la contraseña invalida todas las sesiones.
function sessionSecret() {
  if (config.sessionSecret.length >= 32) return config.sessionSecret;
  if (config.production) throw new Error('Configure SESSION_SECRET (al menos 32 caracteres) en .env antes de iniciar en producción.');
  console.warn('SESSION_SECRET no está configurado en .env: se usa una clave temporal y las sesiones se cerrarán al reiniciar.');
  return randomBytes(32).toString('hex');
}
const secret = sessionSecret();
const mac = value => createHmac('sha256', secret).update(value).digest();
export const passwordFingerprint = hash => mac(`password:${hash}`).toString('hex').slice(0, 32);
const csrfFor = nonce => mac(`csrf:${nonce}`).toString('hex');
const sameText = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Sesiones cerradas antes de vencer. Se conserva en memoria hasta su vencimiento natural.
const revoked = new Map();
function revoke(session) {
  if (!session) return;
  revoked.set(session.n, session.e);
  if (revoked.size > 5000) { const now = Date.now(); for (const [nonce, until] of revoked) if (until <= now) revoked.delete(nonce); }
}
function issueSession(row) {
  const payload = { u: row.id_usuario, n: randomBytes(16).toString('hex'), e: Date.now() + config.sessionHours * 3600000, p: passwordFingerprint(row.password_hash) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${mac(body).toString('base64url')}`, payload, csrfToken: csrfFor(payload.n) };
}
function readSession(token) {
  if (!/^[A-Za-z0-9_-]{20,400}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [body, signature] = token.split('.');
  if (!sameText(signature, mac(body).toString('base64url'))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || !Number.isSafeInteger(payload.u) || payload.u <= 0 || !/^[a-f0-9]{32}$/.test(String(payload.n)) ||
      !Number.isFinite(payload.e) || payload.e <= Date.now() || typeof payload.p !== 'string' || revoked.has(payload.n)) return null;
  return payload;
}
function sessionCookie(req) {
  const value = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('realimenta_session='));
  return value ? value.slice('realimenta_session='.length) : '';
}
export const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };

export async function userFromRow(row, client = db) {
  if (!row) return null;
  const user = {
    id_usuario: row.id_usuario, nombre: fullName(row), nombres: row.nombres, apellidos: row.apellidos || '',
    correo: row.correo, telefono: row.telefono || '', rol: row.rol, estado: row.estado,
    es_demostracion: isDemoEmail(row.correo), fecha_registro: row.fecha_registro, perfil: null
  };
  if (row.rol === 'donante') user.perfil = donorProfile((await client.query('SELECT * FROM donantes WHERE id_usuario = ?', [row.id_usuario])).rows[0]);
  else if (row.rol === 'organizacion') user.perfil = organizationProfile((await client.query('SELECT * FROM organizaciones WHERE id_usuario = ?', [row.id_usuario])).rows[0]);
  return user;
}
export const publicUser = user => ({ id_usuario: user.id_usuario, nombre: user.nombre, correo: user.correo, telefono: user.telefono, rol: user.rol, estado: user.estado });

export async function loadSession(req, res, next) {
  const session = readSession(sessionCookie(req));
  if (session) {
    const row = (await db.query('SELECT * FROM usuarios WHERE id_usuario = ?', [session.u])).rows[0];
    if (row && canSignIn(row.estado) && sameText(passwordFingerprint(row.password_hash), session.p)) {
      req.user = await userFromRow(row);
      req.csrfToken = csrfFor(session.n);
      req.session = session;
    }
  }
  next();
}
export function requireAuth(req, res, next) {
  if (!req.user) fail(401, 'AUTH_REQUIRED', 'Inicie sesión para continuar.');
  next();
}
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) fail(401, 'AUTH_REQUIRED', 'Inicie sesión para continuar.');
    if (!roles.includes(req.user.rol)) fail(403, 'FORBIDDEN', 'Su rol no permite realizar esta operación.');
    next();
  };
}
export function requireVerified(req) {
  if (!req.user.perfil || req.user.perfil.estado_verificacion !== 'verificado')
    fail(403, 'PROFILE_PENDING', 'El perfil está pendiente de verificación. Para la demostración utilice una cuenta de prueba verificada.');
}
export function checkOrigin(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const allowed = new Set([config.origin, `http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`]);
    if (origin && !allowed.has(origin)) fail(403, 'INVALID_ORIGIN', 'El origen de la petición no está autorizado.');
    if (req.get('sec-fetch-site') === 'cross-site') fail(403, 'INVALID_ORIGIN', 'No se admiten peticiones de otro sitio.');
  }
  next();
}
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || ['/auth/login', '/auth/register', '/auth/recuperacion/solicitar', '/auth/recuperacion/restablecer'].includes(req.path)) return next();
  requireAuth(req, res, () => {});
  const value = req.get('x-csrf-token') || '';
  if (!/^[a-f0-9]{64}$/.test(value) || !sameText(value, req.csrfToken))
    fail(403, 'CSRF_REQUIRED', 'La sesión de seguridad cambió. Actualice la página e intente nuevamente.');
  next();
}

// Límite defensivo por IP; usuarios, perfiles y auditoría persisten en MySQL.
const attempts = new Map();
function loginLimit(req) {
  const key = req.ip;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) { attempts.set(key, { count: 1, until: now + 15 * 60000 }); return; }
  if (++entry.count > 60) fail(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Espere 15 minutos antes de reintentar.');
  if (attempts.size > 10000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
}
function passwordInput(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    fail(422, 'INVALID_PASSWORD', 'La contraseña debe contener entre 12 y 128 caracteres.');
  return value;
}
const DUMMY_HASH = 'scrypt$16384$8$1$fb532b197b88147b5c4ab329a711f814$' + '00'.repeat(64);

export const authRouter = Router();
authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user, csrfToken: req.csrfToken }));
authRouter.post('/login', async (req, res) => {
  loginLimit(req);
  const correo = text(req.body.correo, 'correo', 3, 254).toLowerCase();
  const password = typeof req.body.contrasena === 'string' && req.body.contrasena.length <= 128 ? req.body.contrasena : '';
  const row = (await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo])).rows[0];
  // Ejecutar hash también para usuarios inexistentes reduce diferencias de tiempo observables.
  const verified = await verifyPassword(password, row?.password_hash || DUMMY_HASH);
  if (!row || !verified || !canSignIn(row.estado)) fail(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
  const issued = issueSession(row);
  revoke(req.session);
  await audit(db, row.id_usuario, 'usuarios', row.id_usuario, 'iniciar_sesion');
  const user = await userFromRow(row);
  res.cookie('realimenta_session', issued.token, { ...cookieOptions, maxAge: config.sessionHours * 3600000 });
  res.json({ user, csrfToken: issued.csrfToken });
});
authRouter.post('/logout', requireAuth, async (req, res) => {
  revoke(req.session);
  await audit(db, req.user.id_usuario, 'usuarios', req.user.id_usuario, 'cerrar_sesion');
  res.clearCookie('realimenta_session', cookieOptions).json({ data: { message: 'Sesión cerrada.' } });
});
authRouter.post('/register', async (req, res) => {
  loginLimit(req);
  const nombre = text(req.body.nombre, 'nombre', 2, 150);
  const correo = text(req.body.correo, 'correo', 5, 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fail(422, 'INVALID_EMAIL', 'Ingrese un correo válido.');
  const rol = req.body.rol;
  if (!['donante', 'organizacion'].includes(rol)) fail(422, 'INVALID_ROLE', 'Solo se permite registro público de donantes u organizaciones.');
  const telefono = text(req.body.telefono, 'teléfono', 6, 20);
  const perfil = profileInput(req.body, rol);
  const hash = await hashPassword(passwordInput(req.body.contrasena));
  const result = await transaction(async client => {
    if ((await client.query('SELECT 1 FROM usuarios WHERE correo = ?', [correo])).rowCount)
      fail(409, 'EMAIL_IN_USE', 'Ya existe una cuenta registrada con este correo.');
    // estado queda con el valor por defecto de la tabla ("pendiente") hasta la verificación administrativa.
    const user = await client.query('INSERT INTO usuarios (nombres, apellidos, correo, password_hash, telefono, rol) VALUES (?, NULL, ?, ?, ?, ?)', [nombre, correo, hash, telefono, rol]);
    const entries = Object.entries(perfil);
    await client.query(`INSERT INTO ${rol === 'donante' ? 'donantes' : 'organizaciones'} (id_usuario, ${entries.map(([key]) => key).join(', ')})
      VALUES (?, ${entries.map(() => '?').join(', ')})`, [user.insertId, ...entries.map(([, value]) => value)]);
    await audit(client, user.insertId, 'usuarios', user.insertId, 'registrar', { rol, estado_verificacion: 'pendiente' });
    return { id_usuario: user.insertId, estado_verificacion: 'pendiente', message: 'Cuenta registrada. El perfil requiere verificación administrativa; puede iniciar sesión para consultar sus datos.' };
  });
  res.status(201).json({ data: result });
});
