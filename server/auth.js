import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { pool, transaction, audit } from './db.js';
import { config } from './config.js';
import { fail } from './errors.js';
import { text, optionalText, profileInput } from './validation.js';

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

const tokenHash = token => createHash('sha256').update(token).digest('hex');
function sessionCookie(req) {
  const value = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('realimenta_session='));
  return value ? value.slice('realimenta_session='.length) : '';
}
const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };

export async function userFromRow(row, client = pool) {
  if (!row) return null;
  const { id_usuario, nombre, correo, telefono, rol, estado, es_demostracion } = row;
  let perfil = null;
  if (rol === 'donante' || rol === 'organizacion') perfil = (await client.query(`SELECT * FROM ${rol} WHERE id_usuario=$1`, [id_usuario])).rows[0] || null;
  return { id_usuario, nombre, correo, telefono, rol, estado, es_demostracion, perfil };
}
export async function loadSession(req, res, next) {
  const token = sessionCookie(req);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const row = (await pool.query(`SELECT u.*,s.csrf_token FROM sesion s JOIN usuario u USING(id_usuario)
      WHERE s.hash_token=$1 AND s.fecha_expiracion>now() AND u.estado='activo'`, [tokenHash(token)])).rows[0];
    if (row) {
      req.user = await userFromRow(row);
      req.csrfToken = row.csrf_token;
      req.sessionHash = tokenHash(token);
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
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || ['/auth/login', '/auth/register'].includes(req.path)) return next();
  requireAuth(req, res, () => {});
  const value = req.get('x-csrf-token') || '';
  if (!/^[a-f0-9]{64}$/.test(value) || value.length !== req.csrfToken.length || !timingSafeEqual(Buffer.from(value), Buffer.from(req.csrfToken)))
    fail(403, 'CSRF_REQUIRED', 'La sesión de seguridad cambió. Actualice la página e intente nuevamente.');
  next();
}

// Límite defensivo por IP; las entidades de negocio y las sesiones sí persisten en PostgreSQL.
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
export const authRouter = Router();
authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user, csrfToken: req.csrfToken }));
authRouter.post('/login', async (req, res) => {
  loginLimit(req);
  const correo = text(req.body.correo, 'correo', 3, 254).toLowerCase();
  const password = typeof req.body.contrasena === 'string' && req.body.contrasena.length <= 128 ? req.body.contrasena : '';
  const row = (await pool.query('SELECT * FROM usuario WHERE lower(correo)=$1', [correo])).rows[0];
  // Ejecutar hash también para usuarios inexistentes reduce diferencias de tiempo observables.
  const encoded = row?.hash_contrasena || 'scrypt$16384$8$1$fb532b197b88147b5c4ab329a711f814$' + '00'.repeat(64);
  const verified = await verifyPassword(password, encoded);
  if (!row || !verified || row.estado !== 'activo') fail(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
  const token = randomBytes(32).toString('hex'), csrfToken = randomBytes(32).toString('hex');
  const user = await transaction(async client => {
    if (req.sessionHash) await client.query('DELETE FROM sesion WHERE hash_token=$1', [req.sessionHash]);
    await client.query('DELETE FROM sesion WHERE fecha_expiracion<=now()');
    await client.query(`INSERT INTO sesion(hash_token,id_usuario,csrf_token,fecha_expiracion)
      VALUES($1,$2,$3,now()+$4*interval '1 hour')`, [tokenHash(token), row.id_usuario, csrfToken, config.sessionHours]);
    await audit(client, row.id_usuario, 'usuario', row.id_usuario, 'iniciar_sesion');
    return userFromRow(row, client);
  });
  res.cookie('realimenta_session', token, { ...cookieOptions, maxAge: config.sessionHours * 3600000 });
  res.json({ user, csrfToken });
});
authRouter.post('/logout', requireAuth, async (req, res) => {
  await transaction(async client => {
    await client.query('DELETE FROM sesion WHERE hash_token=$1', [req.sessionHash]);
    await audit(client, req.user.id_usuario, 'usuario', req.user.id_usuario, 'cerrar_sesion');
  });
  res.clearCookie('realimenta_session', cookieOptions).json({ data: { message: 'Sesión cerrada.' } });
});
authRouter.post('/register', async (req, res) => {
  loginLimit(req);
  const nombre = text(req.body.nombre, 'nombre', 2, 160);
  const correo = text(req.body.correo, 'correo', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fail(422, 'INVALID_EMAIL', 'Ingrese un correo válido.');
  const rol = req.body.rol;
  if (!['donante', 'organizacion'].includes(rol)) fail(422, 'INVALID_ROLE', 'Solo se permite registro público de donantes u organizaciones.');
  const telefono = text(req.body.telefono, 'teléfono', 6, 40);
  const perfil = profileInput(req.body, rol);
  const hash = await hashPassword(passwordInput(req.body.contrasena));
  const result = await transaction(async client => {
    const user = (await client.query(`INSERT INTO usuario(nombre,correo,hash_contrasena,telefono,rol) VALUES($1,$2,$3,$4,$5) RETURNING *`, [nombre, correo, hash, telefono, rol])).rows[0];
    const entries = Object.entries(perfil);
    await client.query(`INSERT INTO ${rol}(id_usuario,${entries.map(([k]) => k).join(',')}) VALUES($1,${entries.map((_, i) => `$${i + 2}`).join(',')})`, [user.id_usuario, ...entries.map(([, v]) => v)]);
    await audit(client, user.id_usuario, 'usuario', user.id_usuario, 'registrar', { rol, estado_verificacion: 'pendiente' });
    return { id_usuario: user.id_usuario, estado_verificacion: 'pendiente', message: 'Cuenta registrada. El perfil requiere verificación administrativa; puede iniciar sesión para consultar sus datos.' };
  });
  res.status(201).json({ data: result });
});
