// Expediente de verificación de donantes y beneficiarias. Lo llena solo el administrador: código de registro
// (RUNOC o RUOS) o RUC, documentación de respaldo, tipo de verificación, resultado, observaciones y motivo.
// Cada evaluación queda en `verificaciones` con su fecha y administrador; los documentos en `verificacion_documentos`.
// Un rechazo nunca borra la cuenta: si es subsanable, la cuenta puede presentar documentación adicional.
import express, { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db, transaction, audit, placeholders } from './db.js';
import { config } from './config.js';
import { requireAuth, requireRole, fullName } from './auth.js';
import { fail } from './errors.js';
import { id, text, optionalText } from './validation.js';
import { RUC } from './puno.js';
import { notify } from './notifications.js';
import { accountRows, lockedAccount } from './admin.js';
import { parseVerificationCode, verificationCode, donationFromRow } from './mappers.js';

export const VERIFICATION_STATES = ['pendiente', 'en_revision', 'verificado', 'rechazado'];
const RESULT_NAMES = { pendiente: 'pendiente', en_revision: 'en revisión', verificado: 'verificada', rechazado: 'rechazada' };
// Tipos de verificación que el administrador puede marcar (uno o varios).
export const VERIFICATION_TYPES = ['Revisión de documentos', 'Consulta en registro oficial (RUNOC, RUOS o SUNAT)', 'Llamada o entrevista con la representante', 'Visita al local', 'Consulta a la municipalidad', 'Otra'];
const profileTable = role => role === 'donante' ? 'donantes' : 'organizaciones';

// ---------- Documentos ----------
const MAX_DOCUMENT = 10 * 1024 * 1024;
const documentsDirectory = path.join(path.dirname(config.uploadsDir), 'verificaciones');
export const DOCUMENT_FILE = /^doc_[a-f0-9]{16}\.(pdf|jpg|png|webp)$/;
const DOCUMENT_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function sniffDocument(buffer) {
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
const declaredDocument = req => { const type = (req.get('content-type') || '').split(';')[0].trim().toLowerCase(); return DOCUMENT_TYPES[type] ? (type === 'image/jpg' ? 'image/jpeg' : type) : null; };
const documentFromRow = row => ({
  id_documento: row.id_documento, id_verificacion: row.id_verificacion, origen: row.origen, nombre: row.nombre_original,
  tipo_mime: row.tipo_mime, tamano_bytes: row.tamano_bytes, fecha: row.fecha, url: `/media/verificaciones/${row.nombre_archivo}`,
  subido_por: fullName(row) || null
});
async function documentsOf(userId, client = db) {
  return (await client.query(`SELECT d.*, u.nombres, u.apellidos FROM verificacion_documentos d LEFT JOIN usuarios u ON u.id_usuario = d.id_subido_por
    WHERE d.id_usuario = ? ORDER BY d.id_documento`, [userId])).rows.map(documentFromRow);
}
// Guarda un archivo de respaldo (PDF o imagen, hasta 10 MB) tal como se recibió: es evidencia.
async function storeDocument(req, ownerId, origin) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) fail(422, 'DOCUMENT_EMPTY', 'Selecciona un archivo antes de subirlo.');
  const declared = declaredDocument(req), detected = sniffDocument(req.body);
  if (!detected || detected !== declared) fail(422, 'DOCUMENT_INVALID', 'El archivo debe ser un PDF o una imagen JPG, PNG o WebP válidos.');
  let original = 'documento';
  try { original = decodeURIComponent(req.get('x-file-name') || 'documento').replace(/[\u0000-\u001f\u007f]/g, '').replace(/^.*[\\/]/, '').slice(0, 255) || 'documento'; }
  catch { fail(422, 'DOCUMENT_NAME', 'El nombre del archivo no se pudo interpretar.'); }
  const filename = `doc_${randomBytes(8).toString('hex')}.${DOCUMENT_TYPES[detected]}`;
  const destination = path.join(documentsDirectory, filename);
  await mkdir(documentsDirectory, { recursive: true });
  await writeFile(destination, req.body, { flag: 'wx' });
  try {
    return await transaction(async client => {
      const inserted = await client.query(`INSERT INTO verificacion_documentos (id_usuario, id_subido_por, origen, nombre_original, nombre_archivo, tipo_mime, tamano_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [ownerId, req.user.id_usuario, origin, original, filename, detected, req.body.length]);
      await audit(client, req.user.id_usuario, 'verificacion_documentos', inserted.insertId, 'adjuntar_documento', { id_usuario: ownerId, origen: origin, nombre: original, tipo: detected, tamano_bytes: req.body.length });
      const row = (await client.query('SELECT d.*, u.nombres, u.apellidos FROM verificacion_documentos d LEFT JOIN usuarios u ON u.id_usuario = d.id_subido_por WHERE d.id_documento = ?', [inserted.insertId])).rows[0];
      return documentFromRow(row);
    }, { retries: 0 });
  } catch (error) {
    await unlink(destination).catch(cleanup => console.error('No se pudo eliminar el documento no registrado:', cleanup.message));
    throw error;
  }
}
export async function removeAccountDocuments(names) {
  for (const name of names) if (DOCUMENT_FILE.test(name)) await unlink(path.join(documentsDirectory, name)).catch(error => { if (error.code !== 'ENOENT') console.error('No se pudo eliminar el documento:', error.message); });
}
const uploadLimits = new Map();
function uploadGuard(req, res, next) {
  if (!declaredDocument(req)) fail(415, 'DOCUMENT_TYPE', 'Sube un PDF o una imagen JPG, PNG o WebP.');
  const now = Date.now(), key = req.user.id_usuario;
  let entry = uploadLimits.get(key);
  if (!entry || entry.until < now) { entry = { count: 0, until: now + 60000 }; uploadLimits.set(key, entry); }
  if (++entry.count > 30) fail(429, 'DOCUMENT_RATE', 'Has subido muchos archivos seguidos. Espera un minuto.');
  next();
}
const rawDocument = express.raw({ type: Object.keys(DOCUMENT_TYPES), limit: MAX_DOCUMENT });

// ---------- Historial ----------
async function historyOf(userId, client = db) {
  const rows = (await client.query(`SELECT v.*, u.nombres, u.apellidos FROM verificaciones v LEFT JOIN usuarios u ON u.id_usuario = v.id_administrador
    WHERE v.id_usuario = ? ORDER BY v.id_verificacion DESC`, [userId])).rows;
  const documents = await documentsOf(userId, client);
  return rows.map(v => ({
    id_verificacion: v.id_verificacion, fecha: v.fecha, administrador: fullName(v) || 'Administración', resultado: v.resultado, estado_anterior: v.estado_anterior,
    tipos: v.tipo_verificacion ? v.tipo_verificacion.split(' | ') : [], codigo_registro: v.codigo_registro || '', ruc: v.ruc || '',
    observaciones: v.observaciones || '', motivo: v.motivo || '', subsanable: v.subsanable === true || v.subsanable === 1,
    documentos: documents.filter(d => d.id_verificacion === v.id_verificacion)
  }));
}

// Registra una evaluación. La usan el formulario completo del expediente y el cambio rápido de estado.
export async function evaluateAccount(client, admin, userId, body) {
  const resultado = String(body.resultado ?? body.estado ?? '');
  if (!VERIFICATION_STATES.includes(resultado)) fail(422, 'INVALID_VERIFICATION', 'Elige un resultado: pendiente, en revisión, verificada o rechazada.');
  const tipos = (Array.isArray(body.tipos) ? body.tipos : []).map(String).filter(t => VERIFICATION_TYPES.includes(t));
  const observaciones = optionalText(body.observaciones, 'observaciones', 2500);
  const motivo = resultado === 'rechazado' ? text(body.motivo, 'motivo del rechazo', 10, 1000) : optionalText(body.motivo, 'motivo', 1000);
  const subsanable = resultado === 'rechazado' && body.subsanable === true;
  const { user, profile } = await lockedAccount(client, userId);
  if (!profile) fail(409, 'PROFILE_MISSING', 'La cuenta no tiene perfil registrado.');
  // Una cuenta rechazada solo se vuelve a evaluar si se habilitó la subsanación.
  if (profile.estado_verificacion === 'rechazado' && resultado !== 'rechazado' && !(profile.subsanacion_habilitada === true || profile.subsanacion_habilitada === 1))
    fail(409, 'REEVALUATION_LOCKED', 'Esta cuenta fue rechazada. Para evaluarla de nuevo, primero habilita la presentación de documentación adicional.');
  const table = profileTable(user.rol), sets = ['estado_verificacion = ?', 'subsanacion_habilitada = ?'], values = [resultado, subsanable ? 1 : 0];
  let code = null, ruc = null;
  if (user.rol === 'organizacion' && body.codigo_registro !== undefined) {
    code = String(body.codigo_registro || '').trim().toUpperCase();
    if (code && !/^[A-Z0-9][A-Z0-9 .\/-]{2,49}$/.test(code)) fail(422, 'INVALID_REGISTRY_CODE', 'El código de registro solo puede tener letras, números, espacios, puntos, guiones o barras (3 a 50).');
    sets.push('codigo_registro = ?'); values.push(code || null);
  }
  if (user.rol === 'donante' && body.ruc !== undefined && body.ruc !== '') {
    ruc = String(body.ruc).trim();
    if (!new RegExp(RUC).test(ruc)) fail(422, 'INVALID_RUC', 'El RUC debe tener exactamente 11 números.');
    sets.push('ruc = ?'); values.push(ruc);
  }
  await client.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id_usuario = ?`, [...values, userId]);
  if (resultado === 'verificado' && user.estado === 'pendiente') await client.query("UPDATE usuarios SET estado = 'activo' WHERE id_usuario = ?", [userId]);
  const created = await client.query(`INSERT INTO verificaciones (id_usuario, id_administrador, tipo_verificacion, resultado, estado_anterior, codigo_registro, ruc, observaciones, motivo, subsanable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, admin.id_usuario, tipos.join(' | ') || null, resultado, profile.estado_verificacion,
    user.rol === 'organizacion' ? (code ?? profile.codigo_registro ?? null) : null, user.rol === 'donante' ? (ruc ?? profile.ruc ?? null) : null, observaciones || null, motivo || null, subsanable ? 1 : 0]);
  // Los documentos adjuntados desde la evaluación anterior quedan ligados a esta.
  const attached = await client.query('UPDATE verificacion_documentos SET id_verificacion = ? WHERE id_usuario = ? AND id_verificacion IS NULL', [created.insertId, userId]);
  await audit(client, admin.id_usuario, 'usuarios', userId, 'cambiar_verificacion', { estado_anterior: profile.estado_verificacion, estado: resultado, motivo: motivo || null, tipos, id_verificacion: created.insertId, documentos: attached.affectedRows, subsanable });
  const messages = {
    pendiente: 'Tu cuenta volvió a quedar pendiente de verificación.',
    en_revision: 'Estamos revisando los datos de tu cuenta. Te avisaremos cuando termine la revisión.',
    verificado: user.rol === 'donante' ? 'Tu cuenta fue verificada. Ya puedes publicar donaciones.' : 'Tu cuenta fue verificada. Ya puedes solicitar donaciones.',
    rechazado: 'No pudimos verificar tu cuenta. Tus datos se conservan.'
  };
  const extra = subsanable ? ' Puedes presentar documentación adicional desde Mi perfil para una nueva evaluación.' : '';
  await notify(client, userId, { titulo: `Tu cuenta está ${RESULT_NAMES[resultado]}`, mensaje: `${messages[resultado]}${motivo ? ` Motivo: ${motivo}` : ''}${extra}`, tipo: 'verificacion' });
  return created.insertId;
}

export const verificationRouter = Router();
// Administración
verificationRouter.use('/admin', requireAuth, requireRole('administrador'));
verificationRouter.get('/admin/verificacion/tipos', (req, res) => res.json({ data: VERIFICATION_TYPES }));
verificationRouter.get('/admin/cuentas/:id/expediente', async (req, res) => {
  const userId = id(req.params.id);
  const [cuenta] = await accountRows('AND u.id_usuario = ?', [userId]);
  if (!cuenta) fail(404, 'ACCOUNT_NOT_FOUND', 'No se encontró la cuenta.');
  res.json({ data: { cuenta, historial: await historyOf(userId), documentos: await documentsOf(userId), tipos: VERIFICATION_TYPES } });
});
verificationRouter.post('/admin/cuentas/:id/evaluacion', async (req, res) => {
  const userId = id(req.params.id);
  await transaction(client => evaluateAccount(client, req.user, userId, req.body));
  const [cuenta] = await accountRows('AND u.id_usuario = ?', [userId]);
  res.status(201).json({ data: { cuenta, historial: await historyOf(userId) } });
});
// Cambio rápido de estado desde la lista de cuentas (se registra igual en el historial).
verificationRouter.post('/admin/cuentas/:id/verificacion', async (req, res) => {
  const userId = id(req.params.id);
  await transaction(client => evaluateAccount(client, req.user, userId, { resultado: req.body.estado, motivo: req.body.motivo, observaciones: req.body.observaciones }));
  const [cuenta] = await accountRows('AND u.id_usuario = ?', [userId]);
  res.json({ data: cuenta });
});
verificationRouter.post('/admin/cuentas/:id/documentos', uploadGuard, rawDocument, async (req, res) => {
  const userId = id(req.params.id);
  await transaction(client => lockedAccount(client, userId));
  res.status(201).json({ data: await storeDocument(req, userId, 'administrador') });
});
// Solo se quita un documento que todavía no forma parte de una evaluación registrada.
verificationRouter.delete('/admin/documentos/:id', async (req, res) => {
  const documentId = id(req.params.id);
  const name = await transaction(async client => {
    const row = (await client.query('SELECT * FROM verificacion_documentos WHERE id_documento = ? FOR UPDATE', [documentId])).rows[0];
    if (!row) fail(404, 'DOCUMENT_NOT_FOUND', 'No se encontró el documento.');
    if (row.id_verificacion) fail(409, 'DOCUMENT_IN_HISTORY', 'Este documento ya forma parte de una evaluación registrada y se conserva en el historial.');
    await client.query('DELETE FROM verificacion_documentos WHERE id_documento = ?', [documentId]);
    await audit(client, req.user.id_usuario, 'verificacion_documentos', documentId, 'quitar_documento', { id_usuario: row.id_usuario, nombre: row.nombre_original });
    return row.nombre_archivo;
  });
  await removeAccountDocuments([name]);
  res.json({ data: { id_documento: documentId, eliminado: true } });
});
// Habilitar una nueva evaluación de una cuenta rechazada: puede presentar documentación adicional.
verificationRouter.post('/admin/cuentas/:id/subsanacion', async (req, res) => {
  const instrucciones = text(req.body.instrucciones, 'qué debe presentar', 10, 1000);
  const userId = id(req.params.id);
  await transaction(async client => {
    const { user, profile } = await lockedAccount(client, userId);
    if (profile?.estado_verificacion !== 'rechazado') fail(409, 'NOT_REJECTED', 'Solo se habilita la subsanación de una cuenta rechazada.');
    await client.query(`UPDATE ${profileTable(user.rol)} SET subsanacion_habilitada = 1 WHERE id_usuario = ?`, [userId]);
    await client.query(`INSERT INTO verificaciones (id_usuario, id_administrador, resultado, estado_anterior, observaciones, subsanable) VALUES (?, ?, 'subsanacion_habilitada', 'rechazado', ?, 1)`, [userId, req.user.id_usuario, instrucciones]);
    await audit(client, req.user.id_usuario, 'usuarios', userId, 'habilitar_subsanacion', { instrucciones });
    await notify(client, userId, { titulo: 'Puedes presentar documentación adicional', mensaje: `Administración habilitó una nueva evaluación de tu cuenta. ${instrucciones} Súbela desde Mi perfil.`, tipo: 'verificacion' });
  });
  const [cuenta] = await accountRows('AND u.id_usuario = ?', [userId]);
  res.json({ data: { cuenta, historial: await historyOf(userId) } });
});

// La propia cuenta: estado de su verificación y documentación adicional cuando se habilitó la subsanación.
verificationRouter.get('/verificacion/mi-expediente', requireAuth, requireRole('donante', 'organizacion'), async (req, res) => {
  const last = (await db.query("SELECT * FROM verificaciones WHERE id_usuario = ? AND resultado <> 'subsanacion_habilitada' ORDER BY id_verificacion DESC LIMIT 1", [req.user.id_usuario])).rows[0];
  const enabled = (await db.query("SELECT observaciones, fecha FROM verificaciones WHERE id_usuario = ? AND resultado = 'subsanacion_habilitada' ORDER BY id_verificacion DESC LIMIT 1", [req.user.id_usuario])).rows[0];
  const own = (await documentsOf(req.user.id_usuario)).filter(d => d.origen === 'cuenta');
  res.json({ data: {
    estado_verificacion: req.user.perfil?.estado_verificacion || 'pendiente', subsanacion_habilitada: Boolean(req.user.perfil?.subsanacion_habilitada),
    ultima_evaluacion: last ? { resultado: last.resultado, motivo: last.motivo || '', fecha: last.fecha } : null,
    instrucciones: enabled?.observaciones || '', documentos: own
  } });
});
verificationRouter.post('/verificacion/documentos', requireAuth, requireRole('donante', 'organizacion'), (req, res, next) => {
  if (!req.user.perfil?.subsanacion_habilitada) fail(403, 'SUBSANATION_CLOSED', 'Solo puedes presentar documentos cuando administración habilita una nueva evaluación de tu cuenta.');
  next();
}, uploadGuard, rawDocument, async (req, res) => {
  const document = await storeDocument(req, req.user.id_usuario, 'cuenta');
  const admins = (await db.query("SELECT id_usuario FROM usuarios WHERE rol = 'administrador' AND estado = 'activo'")).rows.map(row => row.id_usuario);
  await notify(db, admins, { titulo: 'Se presentó documentación adicional', mensaje: `${req.user.perfil?.nombre_establecimiento || req.user.perfil?.nombre || req.user.nombre} subió "${document.nombre}" para una nueva evaluación.`, tipo: 'verificacion_documento' });
  res.status(201).json({ data: document });
});

// Archivos del expediente: solo administración y la propia cuenta.
export const documentMediaRouter = Router();
documentMediaRouter.use(requireAuth);
documentMediaRouter.get('/:archivo', async (req, res) => {
  if (!DOCUMENT_FILE.test(req.params.archivo)) fail(404, 'DOCUMENT_NOT_FOUND', 'No se encontró el documento.');
  const row = (await db.query('SELECT * FROM verificacion_documentos WHERE nombre_archivo = ?', [req.params.archivo])).rows[0];
  if (!row || (req.user.rol !== 'administrador' && req.user.id_usuario !== row.id_usuario)) fail(404, 'DOCUMENT_NOT_FOUND', 'No se encontró el documento.');
  res.set({ 'Cache-Control': 'private, no-cache', 'Content-Type': row.tipo_mime, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="documento.${row.nombre_archivo.split('.').pop()}"` });
  res.sendFile(path.join(documentsDirectory, row.nombre_archivo), { dotfiles: 'allow' }, error => {
    if (error && !res.headersSent) res.status(404).json({ error: { code: 'DOCUMENT_FILE_MISSING', message: 'El documento no está disponible en el almacenamiento local.' } });
  });
});

// ---------- Consulta por código de verificación ----------
const STATUS_TEXT = { disponible: 'Disponible', en_proceso: 'Asignada, en recojo', finalizada: 'Entregada', expirada: 'Vencida', cancelada: 'Cancelada', pendiente: 'Pendiente de respuesta', en_revision: 'En revisión', aceptada: 'Aceptada', rechazada: 'Rechazada' };
verificationRouter.get('/verificacion/codigo/:codigo', requireAuth, async (req, res) => {
  const parsed = parseVerificationCode(req.params.codigo);
  const notFound = () => fail(404, 'CODE_NOT_FOUND', 'No encontramos un comprobante con ese código entre tus registros. Revisa que esté bien escrito (Ej. D25-7KQ4).');
  if (!parsed) notFound();
  const user = req.user;
  if (parsed.type === 'D') {
    const row = (await db.query(`SELECT d.*, dt.nombre_establecimiento, dt.distrito, dt.id_usuario AS donante_usuario FROM donaciones d JOIN donantes dt ON dt.id_donante = d.id_donante WHERE d.id_donacion = ?`, [parsed.id])).rows[0];
    if (!row || verificationCode('D', row.id_donacion, row.fecha_creacion) !== parsed.code) notFound();
    const involved = user.rol === 'administrador' || user.id_usuario === row.donante_usuario ||
      (user.rol === 'organizacion' && (await db.query('SELECT 1 FROM solicitudes WHERE id_donacion = ? AND id_organizacion = ?', [row.id_donacion, user.perfil?.id_organizacion || -1])).rowCount);
    if (!involved) notFound();
    const d = donationFromRow(row, row);
    const assigned = (await db.query(`SELECT o.nombre, e.estado AS entrega FROM asignaciones a JOIN solicitudes s ON s.id_solicitud = a.id_solicitud
      JOIN organizaciones o ON o.id_organizacion = s.id_organizacion LEFT JOIN entregas e ON e.id_donacion = a.id_donacion WHERE a.id_donacion = ?`, [row.id_donacion])).rows[0];
    return res.json({ data: { tipo: 'donacion', codigo: parsed.code, numero: row.id_donacion, titulo: `Donación #${row.id_donacion}: ${d.alimento}`, estado: STATUS_TEXT[row.estado] || row.estado,
      detalles: [['Alimento', `${d.alimento} (${d.categoria})`], ['Cantidad', `${d.cantidad} ${d.unidad}`], ['Donante', row.nombre_establecimiento], ['Distrito', row.distrito || ''], ['Publicada', d.fecha_creacion], ['Se puede recoger hasta', d.fecha_limite_recojo], ['Asignada a', assigned?.nombre || 'Todavía no se asigna'], ['Recojo', assigned?.entrega ? ({ pendiente: 'Por recoger', en_recojo: 'Recogido', confirmada: 'Recibido', con_incidencia: 'Recibido con problemas' })[assigned.entrega] || assigned.entrega : 'Sin recojo']],
      id_donacion: row.id_donacion } });
  }
  const row = (await db.query(`SELECT s.*, d.nombre_alimento, d.cantidad AS cantidad_donacion, d.unidad, d.id_donante, dt.nombre_establecimiento, dt.id_usuario AS donante_usuario,
      o.nombre AS organizacion, o.id_usuario AS organizacion_usuario, e.estado AS entrega
    FROM solicitudes s JOIN donaciones d ON d.id_donacion = s.id_donacion JOIN donantes dt ON dt.id_donante = d.id_donante
    JOIN organizaciones o ON o.id_organizacion = s.id_organizacion LEFT JOIN entregas e ON e.id_solicitud = s.id_solicitud WHERE s.id_solicitud = ?`, [parsed.id])).rows[0];
  if (!row || verificationCode('S', row.id_solicitud, row.fecha_solicitud) !== parsed.code) notFound();
  if (!(user.rol === 'administrador' || [row.donante_usuario, row.organizacion_usuario].includes(user.id_usuario))) notFound();
  res.json({ data: { tipo: 'solicitud', codigo: parsed.code, numero: row.id_solicitud, titulo: `Solicitud #${row.id_solicitud}: ${row.nombre_alimento}`, estado: STATUS_TEXT[row.estado] || row.estado,
    detalles: [['Donación', `#${row.id_donacion} · ${row.nombre_alimento} (${row.cantidad_donacion} ${row.unidad})`], ['Beneficiaria', row.organizacion], ['Donante', row.nombre_establecimiento], ['Quién recoge', row.responsable_recojo || ''], ['Registrada', row.fecha_solicitud], ['Hora propuesta', row.fecha_recojo_propuesta], ['Tiempo para llegar', row.tiempo_llegada_min ? `${row.tiempo_llegada_min} min` : 'No indicado'], ['Recojo', row.entrega ? ({ pendiente: 'Por recoger', en_recojo: 'Recogido', confirmada: 'Recibido', con_incidencia: 'Recibido con problemas' })[row.entrega] || row.entrega : row.estado === 'aceptada' ? 'Por recoger' : 'Sin recojo']],
    id_donacion: row.id_donacion } });
});
