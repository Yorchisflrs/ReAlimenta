import express, { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { db, transaction, audit, placeholders } from './db.js';
import { config } from './config.js';
import { requireAuth, requireRole, requireVerified, canSignIn } from './auth.js';
import { id } from './validation.js';
import { fail } from './errors.js';
import { photoFromRow } from './mappers.js';

export const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const directory = config.uploadsDir;
const DECLARED = { 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp' };
const SHARP_FORMAT = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
export const PHOTO_FILE = /^donacion_\d{1,10}_[a-f0-9]{16}\.webp$/;
const uploads = new Map();

// Detección MIME real por la firma binaria del archivo; no se confía en la extensión ni en el encabezado.
export function sniffImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
const declaredType = req => DECLARED[(req.get('content-type') || '').split(';')[0].trim().toLowerCase()];

export async function attachPhotos(donations, client = db) {
  const list = donations.filter(Boolean);
  for (const donation of list) donation.fotos = [];
  if (!list.length) return donations;
  const ids = [...new Set(list.map(d => d.id_donacion))];
  const rows = (await client.query(`SELECT * FROM donacion_fotos WHERE id_donacion IN (${placeholders(ids)})
    ORDER BY id_donacion, es_principal DESC, id_foto`, ids)).rows;
  const byDonation = new Map();
  for (const row of rows) {
    if (!PHOTO_FILE.test(row.nombre_archivo)) continue;
    if (!byDonation.has(row.id_donacion)) byDonation.set(row.id_donacion, []);
    byDonation.get(row.id_donacion).push(photoFromRow(row));
  }
  for (const donation of list) donation.fotos = byDonation.get(donation.id_donacion) || [];
  return donations;
}

async function canEdit(user, donationId, client = db, lock = false) {
  const d = (await client.query(`SELECT * FROM donaciones WHERE id_donacion = ? ${lock ? 'FOR UPDATE' : ''}`, [donationId])).rows[0];
  if (!d) fail(404, 'DONATION_NOT_FOUND', 'No se encontró la donación.');
  if (d.id_donante !== user.perfil?.id_donante) fail(403, 'NOT_OWNER', 'Solo el donante propietario puede subir fotografías.');
  if (d.estado !== 'disponible' || Date.parse(d.fecha_limite_recojo) <= Date.now()) fail(409, 'PHOTO_STATE', 'Solo se pueden agregar fotos a una donación disponible con fechas vigentes.');
  if ((await client.query("SELECT 1 FROM solicitudes WHERE id_donacion = ? AND estado IN ('pendiente','en_revision','aceptada') LIMIT 1", [donationId])).rowCount)
    fail(409, 'PHOTO_REQUESTS', 'Las fotos no pueden cambiar después de recibir solicitudes activas.');
  return d;
}

export const photoRouter = Router();
photoRouter.post('/donaciones/:id/foto', requireAuth, requireRole('donante'), async (req, res, next) => {
  requireVerified(req);
  await canEdit(req.user, id(req.params.id));
  if (!declaredType(req)) fail(415, 'PHOTO_TYPE', 'Selecciona una foto JPG, JPEG, PNG o WebP. No se admiten SVG, GIF, ejecutables ni documentos.');
  const now = Date.now(), key = req.user.id_usuario;
  let entry = uploads.get(key);
  if (!entry || entry.until < now) { entry = { count: 0, until: now + 60000 }; uploads.set(key, entry); }
  if (++entry.count > 20) fail(429, 'PHOTO_RATE', 'Has realizado varias cargas. Espera un minuto antes de volver a intentarlo.');
  if (uploads.size > 5000) for (const [k, v] of uploads) if (v.until < now) uploads.delete(k);
  next();
}, express.raw({ type: Object.keys(DECLARED), limit: MAX_BYTES }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) fail(422, 'PHOTO_EMPTY', 'Selecciona una fotografía antes de subirla.');
  const declared = declaredType(req), detected = sniffImage(req.body);
  if (!detected || detected !== declared) fail(422, 'PHOTO_INVALID', 'El contenido del archivo no corresponde a una fotografía JPG, PNG o WebP.');
  let result;
  try {
    const image = sharp(req.body, { limitInputPixels: 25000000, failOn: 'error', animated: false });
    const meta = await image.metadata();
    if (meta.format !== SHARP_FORMAT[detected] || Number(meta.pages || 1) > 1) fail(422, 'PHOTO_INVALID', 'El contenido no corresponde a una fotografía admitida.');
    // Recodificar a WebP elimina metadatos (EXIF/GPS) y cualquier contenido incrustado que no sea imagen.
    result = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error.code === 'PHOTO_INVALID') throw error;
    fail(422, 'PHOTO_INVALID', 'No se pudo leer la foto. Usa JPG, PNG o WebP válido, de hasta 5 MB y 25 megapíxeles.');
  }
  let original = 'fotografia';
  try { original = decodeURIComponent(req.get('x-file-name') || 'fotografia').replace(/[\u0000-\u001f\u007f]/g, '').replace(/^.*[\\/]/, '').slice(0, 255) || 'fotografia'; }
  catch { fail(422, 'PHOTO_NAME', 'El nombre del archivo no se pudo interpretar.'); }
  const donationId = id(req.params.id);
  const filename = `donacion_${donationId}_${randomBytes(8).toString('hex')}.webp`;
  const destination = path.join(directory, filename);
  const relativePath = path.relative(config.root, destination).split(path.sep).join('/');
  let written = false;
  try {
    const photo = await transaction(async client => {
      const d = await canEdit(req.user, donationId, client, true);
      const total = Number((await client.query('SELECT COUNT(*) AS total FROM donacion_fotos WHERE id_donacion = ?', [d.id_donacion])).rows[0].total);
      if (total >= MAX_PHOTOS) fail(409, 'PHOTO_LIMIT', `Cada donación admite hasta ${MAX_PHOTOS} fotografías.`);
      await mkdir(directory, { recursive: true });
      await writeFile(destination, result.data, { flag: 'wx' });
      written = true;
      const inserted = await client.query(`INSERT INTO donacion_fotos (id_donacion, nombre_original, nombre_archivo, ruta_archivo, tipo_mime, tamano_bytes, es_principal)
        VALUES (?, ?, ?, ?, 'image/webp', ?, ?)`, [d.id_donacion, original, filename, relativePath, result.data.length, total === 0]);
      await audit(client, req.user.id_usuario, 'donacion_fotos', inserted.insertId, 'agregar_fotografia', { id_donacion: d.id_donacion, nombre_archivo: filename, tipo_original: detected, ancho: result.info.width, alto: result.info.height });
      const row = (await client.query('SELECT * FROM donacion_fotos WHERE id_foto = ?', [inserted.insertId])).rows[0];
      return { ...photoFromRow(row), ancho: result.info.width, alto: result.info.height };
    }, { retries: 0 });
    res.status(201).json({ data: photo });
  } catch (error) {
    // Si falla MySQL o la confirmación, no se deja el archivo huérfano en la carpeta.
    if (written) await unlink(destination).catch(cleanup => console.error('No se pudo eliminar la fotografía no registrada:', cleanup.message));
    throw error;
  }
});

export const mediaRouter = Router();
mediaRouter.use(requireAuth);
mediaRouter.get('/:archivo', async (req, res) => {
  if (!PHOTO_FILE.test(req.params.archivo)) fail(404, 'PHOTO_NOT_FOUND', 'No se encontró la fotografía.');
  const row = (await db.query(`SELECT d.id_donacion, d.id_donante, d.estado, d.fecha_limite_recojo, dt.estado_verificacion, u.estado AS donante_estado
    FROM donacion_fotos f JOIN donaciones d ON d.id_donacion = f.id_donacion JOIN donantes dt ON dt.id_donante = d.id_donante
    JOIN usuarios u ON u.id_usuario = dt.id_usuario WHERE f.nombre_archivo = ?`, [req.params.archivo])).rows[0];
  if (!row) fail(404, 'PHOTO_NOT_FOUND', 'No se encontró la fotografía.');
  if (req.user.rol === 'donante' && row.id_donante !== req.user.perfil?.id_donante) fail(404, 'PHOTO_NOT_FOUND', 'No se encontró la fotografía.');
  if (req.user.rol === 'organizacion' && !(row.estado === 'disponible' && Date.parse(row.fecha_limite_recojo) > Date.now() && row.estado_verificacion === 'verificado' && canSignIn(row.donante_estado))) {
    if (!(await db.query('SELECT 1 FROM solicitudes WHERE id_donacion = ? AND id_organizacion = ?', [row.id_donacion, req.user.perfil?.id_organizacion || -1])).rowCount)
      fail(404, 'PHOTO_NOT_FOUND', 'No se encontró la fotografía.');
  }
  res.set({ 'Cache-Control': 'private, no-cache', 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
  // Solo esta ruta autenticada lee la carpeta de fotografías; Apache tiene prohibido servirla.
  res.sendFile(path.join(directory, req.params.archivo), { dotfiles: 'allow' }, error => {
    if (error && !res.headersSent) res.status(404).json({ error: { code: 'PHOTO_FILE_MISSING', message: 'La fotografía no está disponible en el almacenamiento local.' } });
  });
});
