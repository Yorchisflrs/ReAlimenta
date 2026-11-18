// Administración: verificación y control de cuentas, listas del sistema y reportes de impacto.
// Cada decisión exige o admite un motivo, queda en auditoría y se avisa a las personas afectadas.
import { Router } from 'express';
import { db, transaction, audit, placeholders } from './db.js';
import { requireAuth, requireRole, isDemoEmail, fullName } from './auth.js';
import { fail } from './errors.js';
import { id, text, optionalText, words, bool, registrationProfile, personName, phone, registrationEmail, donationInput } from './validation.js';
import { donorProfile, organizationProfile, parseDetail, donationFromRow, toDonationColumns, PENDING_REQUEST_STATES, ACTIVE_REQUEST_STATES } from './mappers.js';
import { removeLocalPhoto } from './photos.js';
import { notify } from './notifications.js';
import { cancelDonation } from './business.js';
import { getTracking, releaseTracking } from './custody.js';
import { CATALOG_TYPES, invalidateCatalogs } from './catalogs.js';
import { removeAccountDocuments } from './verification.js';

const profileTable = role => role === 'donante' ? 'donantes' : 'organizaciones';
const VERIFICATION_FILTERS = ['pendiente', 'en_revision', 'verificado', 'rechazado'];

export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requireRole('administrador'));

// ---------- Cuentas ----------
export async function accountRows(where = '', params = [], client = db) {
  const users = (await client.query(`SELECT u.* FROM usuarios u WHERE u.rol IN ('donante','organizacion') ${where} ORDER BY u.fecha_registro DESC, u.id_usuario DESC LIMIT 300`, params)).rows;
  if (!users.length) return [];
  const ids = users.map(u => u.id_usuario);
  const donors = new Map((await client.query(`SELECT * FROM donantes WHERE id_usuario IN (${placeholders(ids)})`, ids)).rows.map(row => [row.id_usuario, row]));
  const orgs = new Map((await client.query(`SELECT * FROM organizaciones WHERE id_usuario IN (${placeholders(ids)})`, ids)).rows.map(row => [row.id_usuario, row]));
  const donations = new Map((await client.query(`SELECT dt.id_usuario, COUNT(d.id_donacion) AS total FROM donantes dt LEFT JOIN donaciones d ON d.id_donante = dt.id_donante
    WHERE dt.id_usuario IN (${placeholders(ids)}) GROUP BY dt.id_usuario`, ids)).rows.map(row => [row.id_usuario, Number(row.total)]));
  const requests = new Map((await client.query(`SELECT o.id_usuario, COUNT(s.id_solicitud) AS total FROM organizaciones o LEFT JOIN solicitudes s ON s.id_organizacion = o.id_organizacion
    WHERE o.id_usuario IN (${placeholders(ids)}) GROUP BY o.id_usuario`, ids)).rows.map(row => [row.id_usuario, Number(row.total)]));
  const decisions = new Map((await client.query(`SELECT a.id_registro, a.accion, a.descripcion, a.fecha FROM auditoria a
    JOIN (SELECT MAX(id_auditoria) AS id FROM auditoria WHERE tabla_afectada = 'usuarios' AND accion IN ('cambiar_verificacion','suspender_cuenta','reactivar_cuenta','habilitar_subsanacion')
      AND id_registro IN (${placeholders(ids)}) GROUP BY id_registro) ultima ON ultima.id = a.id_auditoria`, ids)).rows
    .map(row => [row.id_registro, { accion: row.accion, fecha: row.fecha, ...parseDetail(row.descripcion) }]));
  return users.map(u => {
    const raw = u.rol === 'donante' ? donors.get(u.id_usuario) : orgs.get(u.id_usuario);
    const perfil = raw ? { ...(u.rol === 'donante' ? donorProfile(raw) : organizationProfile(raw)), dni_representante: raw.dni_representante || '' } : null;
    return {
      id_usuario: u.id_usuario, nombre: fullName(u), correo: u.correo, telefono: u.telefono || '', rol: u.rol, estado: u.estado,
      fecha_registro: u.fecha_registro, es_demostracion: isDemoEmail(u.correo), perfil,
      estado_verificacion: perfil?.estado_verificacion || 'pendiente',
      registros: u.rol === 'donante' ? donations.get(u.id_usuario) || 0 : requests.get(u.id_usuario) || 0,
      ultima_decision: decisions.get(u.id_usuario) || null
    };
  });
}
export async function lockedAccount(client, userId) {
  const user = (await client.query('SELECT * FROM usuarios WHERE id_usuario = ? FOR UPDATE', [userId])).rows[0];
  if (!user) fail(404, 'ACCOUNT_NOT_FOUND', 'No se encontró la cuenta.');
  if (!['donante', 'organizacion'].includes(user.rol)) fail(403, 'ADMIN_ACCOUNT', 'Las cuentas de administración no se gestionan desde aquí.');
  const profile = (await client.query(`SELECT * FROM ${profileTable(user.rol)} WHERE id_usuario = ? FOR UPDATE`, [userId])).rows[0];
  return { user, profile };
}
adminRouter.get('/admin/cuentas', async (req, res) => {
  const conditions = [], params = [];
  if (['donante', 'organizacion'].includes(req.query.rol)) { conditions.push('u.rol = ?'); params.push(req.query.rol); }
  if (['pendiente', 'activo', 'suspendido'].includes(req.query.estado)) { conditions.push('u.estado = ?'); params.push(req.query.estado); }
  const list = await accountRows(conditions.length ? `AND ${conditions.join(' AND ')}` : '', params);
  const verification = String(req.query.verificacion || '');
  res.json({ data: VERIFICATION_FILTERS.includes(verification) ? list.filter(a => a.estado_verificacion === verification) : list });
});
adminRouter.get('/admin/cuentas/:id', async (req, res) => {
  const [account] = await accountRows('AND u.id_usuario = ?', [id(req.params.id)]);
  if (!account) fail(404, 'ACCOUNT_NOT_FOUND', 'No se encontró la cuenta.');
  res.json({ data: account });
});

// Suspender (vetar): la cuenta deja de poder entrar y sus operaciones abiertas se cierran avisando a la otra parte.
adminRouter.post('/admin/cuentas/:id/suspender', async (req, res) => {
  const motivo = text(req.body.motivo, 'motivo', 10, 1000);
  const userId = id(req.params.id);
  const result = await transaction(async client => {
    const { user, profile } = await lockedAccount(client, userId);
    if (user.estado === 'suspendido') fail(409, 'ALREADY_SUSPENDED', 'La cuenta ya está suspendida.');
    await client.query("UPDATE usuarios SET estado = 'suspendido' WHERE id_usuario = ?", [userId]);
    const effects = { donaciones_canceladas: 0, solicitudes_canceladas: 0, recojos_anulados: 0, entregas_en_curso: 0 };
    const reason = `La cuenta de la otra parte fue suspendida por administración: ${motivo}`;
    if (profile && user.rol === 'donante') {
      const donations = (await client.query(`SELECT d.*, e.estado AS entrega_estado FROM donaciones d LEFT JOIN entregas e ON e.id_donacion = d.id_donacion
        WHERE d.id_donante = ? AND d.estado IN ('disponible','en_proceso') ORDER BY d.id_donacion FOR UPDATE`, [profile.id_donante])).rows;
      for (const d of donations) {
        if (d.entrega_estado && d.entrega_estado !== 'pendiente') {
          // Ya recogida: la beneficiaria sigue con el seguimiento y se le avisa.
          effects.entregas_en_curso++;
          const org = (await client.query(`SELECT o.id_usuario, s.id_solicitud FROM entregas e JOIN solicitudes s ON s.id_solicitud = e.id_solicitud
            JOIN organizaciones o ON o.id_organizacion = s.id_organizacion WHERE e.id_donacion = ?`, [d.id_donacion])).rows[0];
          await notify(client, org?.id_usuario, { titulo: 'El donante fue suspendido', mensaje: `Administración suspendió al donante de "${d.nombre_alimento}". Registra la recepción o reporta una incidencia si hay algún problema.`, tipo: 'cuenta_suspendida', id_donacion: d.id_donacion, id_solicitud: org?.id_solicitud });
        } else { await cancelDonation(client, req.user.id_usuario, d, reason, 'Administración', 'cancelar_por_suspension'); effects.donaciones_canceladas++; }
      }
    } else if (profile) {
      const requests = (await client.query(`SELECT s.*, d.nombre_alimento, d.id_donante, dt.id_usuario AS donante_usuario, e.id_entrega, e.estado AS entrega_estado
        FROM solicitudes s JOIN donaciones d ON d.id_donacion = s.id_donacion JOIN donantes dt ON dt.id_donante = d.id_donante LEFT JOIN entregas e ON e.id_solicitud = s.id_solicitud
        WHERE s.id_organizacion = ? AND s.estado IN ('pendiente','en_revision','aceptada') ORDER BY s.id_solicitud`, [profile.id_organizacion])).rows;
      for (const r of requests) {
        if (r.estado !== 'aceptada') {
          await client.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id_solicitud = ?", [r.id_solicitud]);
          await audit(client, req.user.id_usuario, 'solicitudes', r.id_solicitud, 'cancelar_por_suspension', { motivo: reason });
          await notify(client, r.donante_usuario, { titulo: 'Se canceló una solicitud que recibiste', mensaje: `Administración suspendió a la beneficiaria que pidió "${r.nombre_alimento}"; su solicitud se canceló.`, tipo: 'cuenta_suspendida', id_donacion: r.id_donacion, id_solicitud: r.id_solicitud });
          effects.solicitudes_canceladas++;
        } else if (r.id_entrega && r.entrega_estado === 'pendiente') {
          // Aceptada pero sin recoger: se anula el recojo y la donación vuelve a publicarse para otras beneficiarias.
          await releaseTracking(client, req.user, await getTracking(req.user, r.id_entrega, client), reason);
          effects.recojos_anulados++;
        } else {
          effects.entregas_en_curso++;
          await notify(client, r.donante_usuario, { titulo: 'La beneficiaria fue suspendida', mensaje: `Administración suspendió a la beneficiaria que recogió "${r.nombre_alimento}". Si hay algún problema, repórtalo como incidencia.`, tipo: 'cuenta_suspendida', id_donacion: r.id_donacion, id_solicitud: r.id_solicitud });
        }
      }
    }
    await audit(client, req.user.id_usuario, 'usuarios', userId, 'suspender_cuenta', { motivo, ...effects });
    await notify(client, userId, { titulo: 'Tu cuenta fue suspendida', mensaje: `Administración suspendió tu cuenta. Motivo: ${motivo}`, tipo: 'cuenta_suspendida' });
    return effects;
  });
  const [account] = await accountRows('AND u.id_usuario = ?', [userId]);
  res.json({ data: { ...account, efectos: result } });
});
adminRouter.post('/admin/cuentas/:id/reactivar', async (req, res) => {
  const motivo = text(req.body.motivo, 'motivo', 5, 1000);
  const userId = id(req.params.id);
  await transaction(async client => {
    const { user, profile } = await lockedAccount(client, userId);
    if (user.estado !== 'suspendido') fail(409, 'NOT_SUSPENDED', 'La cuenta no está suspendida.');
    const estado = profile?.estado_verificacion === 'verificado' ? 'activo' : 'pendiente';
    await client.query('UPDATE usuarios SET estado = ? WHERE id_usuario = ?', [estado, userId]);
    await audit(client, req.user.id_usuario, 'usuarios', userId, 'reactivar_cuenta', { motivo, estado });
    await notify(client, userId, { titulo: 'Tu cuenta fue reactivada', mensaje: `Administración reactivó tu cuenta. Motivo: ${motivo}`, tipo: 'cuenta_reactivada' });
  });
  const [account] = await accountRows('AND u.id_usuario = ?', [userId]);
  res.json({ data: account });
});
// Eliminar: solo cuentas sin donaciones ni solicitudes; las demás se suspenden para no perder el historial de nadie.
adminRouter.delete('/admin/cuentas/:id', async (req, res) => {
  const motivo = text(req.body?.motivo, 'motivo', 10, 1000);
  const userId = id(req.params.id);
  const photo = await transaction(async client => {
    const { user, profile } = await lockedAccount(client, userId);
    if (isDemoEmail(user.correo)) fail(409, 'DEMO_ACCOUNT', 'Las cuentas de prueba no se eliminan.');
    if (profile) {
      const used = user.rol === 'donante'
        ? (await client.query('SELECT 1 FROM donaciones WHERE id_donante = ? LIMIT 1', [profile.id_donante])).rowCount
        : (await client.query('SELECT 1 FROM solicitudes WHERE id_organizacion = ? LIMIT 1', [profile.id_organizacion])).rowCount;
      if (used) fail(409, 'ACCOUNT_HAS_HISTORY', `Esta cuenta ya tiene ${user.rol === 'donante' ? 'donaciones' : 'solicitudes'} registradas. Para no borrar el historial de otras personas, suspéndela.`);
    }
    const documents = (await client.query('SELECT nombre_archivo FROM verificacion_documentos WHERE id_usuario = ?', [userId])).rows.map(row => row.nombre_archivo);
    await client.query('DELETE FROM verificacion_documentos WHERE id_usuario = ?', [userId]);
    await client.query('DELETE FROM verificaciones WHERE id_usuario = ?', [userId]);
    await client.query('UPDATE verificaciones SET id_administrador = NULL WHERE id_administrador = ?', [userId]);
    await client.query('UPDATE verificacion_documentos SET id_subido_por = NULL WHERE id_subido_por = ?', [userId]);
    await client.query('DELETE FROM notificaciones WHERE id_usuario = ?', [userId]);
    if (profile) await client.query(`DELETE FROM ${profileTable(user.rol)} WHERE id_usuario = ?`, [userId]);
    await client.query('UPDATE seguimientos SET id_usuario = NULL WHERE id_usuario = ?', [userId]);
    await client.query('UPDATE incidencias SET id_usuario = NULL WHERE id_usuario = ?', [userId]);
    await client.query('DELETE FROM usuarios WHERE id_usuario = ?', [userId]);
    await audit(client, req.user.id_usuario, 'usuarios', userId, 'eliminar_cuenta', { motivo, rol: user.rol, nombre: fullName(user), entidad: profile?.nombre_establecimiento || profile?.nombre || null });
    return { photo: profile?.foto_local || null, documents };
  });
  if (photo.photo) await removeLocalPhoto(photo.photo);
  await removeAccountDocuments(photo.documents);
  res.json({ data: { id_usuario: userId, eliminada: true } });
});

// Editar los datos de una cuenta (mismas reglas que el registro). Se avisa a la cuenta.
adminRouter.patch('/admin/cuentas/:id/datos', async (req, res) => {
  const userId = id(req.params.id);
  await transaction(async client => {
    const { user, profile } = await lockedAccount(client, userId);
    const current = user.rol === 'donante' ? donorProfile(profile) : organizationProfile(profile);
    const nombre = personName(req.body.nombre ?? fullName(user), 'nombre');
    const telefono = phone(req.body.telefono ?? user.telefono ?? '');
    const correo = req.body.correo == null || req.body.correo === user.correo ? user.correo : registrationEmail(req.body.correo);
    if (correo !== user.correo && isDemoEmail(user.correo)) fail(409, 'DEMO_EMAIL_LOCKED', 'El correo de una cuenta de prueba no se puede cambiar.');
    if (correo !== user.correo && (await client.query('SELECT 1 FROM usuarios WHERE correo = ? AND id_usuario <> ?', [correo, userId])).rowCount) fail(409, 'EMAIL_IN_USE', 'Ya existe otra cuenta con este correo.');
    const next = registrationProfile({ nombre, perfil: { ...current, ...(req.body.perfil || {}) } }, user.rol, true, { tipo_organizacion: current?.tipo_organizacion });
    const entries = Object.entries(next);
    await client.query(`UPDATE ${user.rol === 'donante' ? 'donantes' : 'organizaciones'} SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id_usuario = ?`, [...entries.map(([, v]) => v), userId]);
    await client.query('UPDATE usuarios SET nombres = ?, apellidos = NULL, telefono = ?, correo = ? WHERE id_usuario = ?', [nombre, telefono, correo, userId]);
    const changed = Object.keys(req.body.perfil || {}).concat(['nombre', 'telefono', 'correo'].filter(key => req.body[key] !== undefined));
    await audit(client, req.user.id_usuario, 'usuarios', userId, 'editar_cuenta_admin', { campos: changed });
    await notify(client, userId, { titulo: 'Administración actualizó tus datos', mensaje: 'Revisa tu perfil: administración corrigió algunos datos de tu cuenta. Si algo no es correcto, comunícate con administración.', tipo: 'cuenta_editada' });
  });
  const [account] = await accountRows('AND u.id_usuario = ?', [userId]);
  res.json({ data: account });
});
// Editar una donación disponible o asignada. Se avisa al donante y a las beneficiarias con solicitudes activas.
adminRouter.patch('/admin/donaciones/:id', async (req, res) => {
  const donationId = id(req.params.id);
  await transaction(async client => {
    const existing = (await client.query('SELECT * FROM donaciones WHERE id_donacion = ? FOR UPDATE', [donationId])).rows[0];
    if (!existing) fail(404, 'DONATION_NOT_FOUND', 'No se encontró la donación.');
    if (!['disponible', 'en_proceso'].includes(existing.estado)) fail(409, 'INVALID_STATE', 'Solo se editan donaciones disponibles o asignadas.');
    const donor = (await client.query('SELECT * FROM donantes WHERE id_donante = ?', [existing.id_donante])).rows[0];
    const value = donationInput({ ...donationFromRow(existing, donor), ...req.body }, existing.categoria);
    const columns = Object.entries(toDonationColumns(value, donor));
    await client.query(`UPDATE donaciones SET ${columns.map(([key]) => `${key} = ?`).join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_donacion = ?`, [...columns.map(([, v]) => v), donationId]);
    await audit(client, req.user.id_usuario, 'donaciones', donationId, 'editar_admin', { campos: Object.keys(req.body) });
    const orgs = (await client.query(`SELECT o.id_usuario FROM solicitudes s JOIN organizaciones o ON o.id_organizacion = s.id_organizacion WHERE s.id_donacion = ? AND s.estado IN (${placeholders(ACTIVE_REQUEST_STATES)})`, [donationId, ...ACTIVE_REQUEST_STATES])).rows.map(r => r.id_usuario);
    await notify(client, [donor.id_usuario, ...orgs], { titulo: 'Administración actualizó una donación', mensaje: `Se corrigieron datos de "${value.alimento}". Revisa el detalle antes del recojo.`, tipo: 'donacion_editada', id_donacion: donationId });
  });
  res.json({ data: { id_donacion: donationId, actualizada: true } });
});
adminRouter.post('/admin/donaciones/:id/cancelar', async (req, res) => {
  const motivo = text(req.body.motivo, 'motivo', 10, 1000);
  const donationId = id(req.params.id);
  await transaction(async client => {
    const existing = (await client.query('SELECT * FROM donaciones WHERE id_donacion = ? FOR UPDATE', [donationId])).rows[0];
    if (!existing) fail(404, 'DONATION_NOT_FOUND', 'No se encontró la donación.');
    await cancelDonation(client, req.user.id_usuario, existing, motivo, 'Administración', 'cancelar_admin');
    const donor = (await client.query('SELECT id_usuario FROM donantes WHERE id_donante = ?', [existing.id_donante])).rows[0];
    await notify(client, donor.id_usuario, { titulo: 'Administración canceló tu donación', mensaje: `Se canceló "${existing.nombre_alimento}". Motivo: ${motivo}`, tipo: 'donacion_cancelada', id_donacion: donationId });
  });
  res.json({ data: { id_donacion: donationId, estado: 'cancelada' } });
});
// Cancelar una solicitud pendiente (una aceptada se anula desde el recojo).
adminRouter.post('/admin/solicitudes/:id/cancelar', async (req, res) => {
  const motivo = text(req.body.motivo, 'motivo', 10, 1000);
  const requestId = id(req.params.id);
  await transaction(async client => {
    const row = (await client.query(`SELECT s.*, d.nombre_alimento, dt.id_usuario AS donante, o.id_usuario AS organizacion FROM solicitudes s JOIN donaciones d ON d.id_donacion = s.id_donacion
      JOIN donantes dt ON dt.id_donante = d.id_donante JOIN organizaciones o ON o.id_organizacion = s.id_organizacion WHERE s.id_solicitud = ? FOR UPDATE`, [requestId])).rows[0];
    if (!row) fail(404, 'REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
    if (!PENDING_REQUEST_STATES.includes(row.estado)) fail(409, 'INVALID_STATE', 'Solo se cancelan solicitudes pendientes. Para una aceptada, anula el recojo desde Recojos y entregas.');
    await client.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id_solicitud = ?", [requestId]);
    await audit(client, req.user.id_usuario, 'solicitudes', requestId, 'cancelar_admin', { motivo, id_donacion: row.id_donacion });
    await notify(client, [row.donante, row.organizacion], { titulo: 'Administración canceló una solicitud', mensaje: `Se canceló la solicitud para "${row.nombre_alimento}". Motivo: ${motivo}`, tipo: 'solicitud_cancelada', id_donacion: row.id_donacion, id_solicitud: requestId });
  });
  res.json({ data: { id_solicitud: requestId, estado: 'cancelada' } });
});

// ---------- Listas del sistema ----------
async function catalogList(client = db) {
  const rows = (await client.query('SELECT * FROM catalogos ORDER BY tipo, orden, id_catalogo')).rows;
  const usage = {
    tipo_organizacion: new Map((await client.query('SELECT tipo_organizacion AS valor, COUNT(*) AS total FROM organizaciones GROUP BY tipo_organizacion')).rows.map(r => [r.valor, Number(r.total)])),
    tipo_alimento: new Map((await client.query('SELECT categoria AS valor, COUNT(*) AS total FROM donaciones GROUP BY categoria')).rows.map(r => [r.valor, Number(r.total)]))
  };
  return Object.fromEntries(Object.entries(CATALOG_TYPES).map(([tipo, info]) => [tipo, {
    nombre: info.nombre,
    valores: rows.filter(r => r.tipo === tipo).map(r => ({ id_catalogo: r.id_catalogo, valor: r.valor, activo: r.activo === true || r.activo === 1, orden: r.orden, en_uso: usage[tipo].get(r.valor) || 0 }))
  }]));
}
adminRouter.get('/admin/catalogos', async (req, res) => res.json({ data: await catalogList() }));
adminRouter.post('/admin/catalogos', async (req, res) => {
  const tipo = String(req.body.tipo || '');
  if (!CATALOG_TYPES[tipo]) fail(422, 'INVALID_CATALOG', 'Elige una lista válida.');
  const valor = words(req.body.valor, 'nombre', 3, 100).replace(/\s+/g, ' ');
  await transaction(async client => {
    const existing = (await client.query('SELECT * FROM catalogos WHERE tipo = ? AND valor = ? FOR UPDATE', [tipo, valor])).rows[0];
    if (existing && (existing.activo === true || existing.activo === 1)) fail(409, 'CATALOG_EXISTS', `"${valor}" ya está en la lista.`);
    if (existing) await client.query('UPDATE catalogos SET activo = 1 WHERE id_catalogo = ?', [existing.id_catalogo]);
    else {
      const next = (await client.query('SELECT COALESCE(MAX(orden), 0) + 1 AS orden FROM catalogos WHERE tipo = ?', [tipo])).rows[0].orden;
      await client.query('INSERT INTO catalogos (tipo, valor, orden) VALUES (?, ?, ?)', [tipo, valor, next]);
    }
    await audit(client, req.user.id_usuario, 'catalogos', existing?.id_catalogo ?? null, 'agregar_valor', { tipo, valor });
  });
  invalidateCatalogs();
  res.status(201).json({ data: await catalogList() });
});
adminRouter.patch('/admin/catalogos/:id', async (req, res) => {
  const activo = bool(req.body.activo, 'activo');
  const catalogId = id(req.params.id);
  await transaction(async client => {
    const row = (await client.query('SELECT * FROM catalogos WHERE id_catalogo = ? FOR UPDATE', [catalogId])).rows[0];
    if (!row) fail(404, 'CATALOG_NOT_FOUND', 'No se encontró el valor.');
    if (!activo) {
      const others = (await client.query('SELECT COUNT(*) AS total FROM catalogos WHERE tipo = ? AND activo = 1 AND id_catalogo <> ?', [row.tipo, catalogId])).rows[0].total;
      if (!Number(others)) fail(409, 'CATALOG_LAST', 'La lista debe tener al menos una opción activa.');
    }
    await client.query('UPDATE catalogos SET activo = ? WHERE id_catalogo = ?', [activo ? 1 : 0, catalogId]);
    await audit(client, req.user.id_usuario, 'catalogos', catalogId, activo ? 'activar_valor' : 'desactivar_valor', { tipo: row.tipo, valor: row.valor });
  });
  invalidateCatalogs();
  res.json({ data: await catalogList() });
});
adminRouter.delete('/admin/catalogos/:id', async (req, res) => {
  const catalogId = id(req.params.id);
  await transaction(async client => {
    const row = (await client.query('SELECT * FROM catalogos WHERE id_catalogo = ? FOR UPDATE', [catalogId])).rows[0];
    if (!row) fail(404, 'CATALOG_NOT_FOUND', 'No se encontró el valor.');
    const used = row.tipo === 'tipo_organizacion'
      ? (await client.query('SELECT 1 FROM organizaciones WHERE tipo_organizacion = ? LIMIT 1', [row.valor])).rowCount
      : (await client.query('SELECT 1 FROM donaciones WHERE categoria = ? LIMIT 1', [row.valor])).rowCount;
    if (used) fail(409, 'CATALOG_IN_USE', `Hay registros que usan "${row.valor}". Desactívalo para que ya no se ofrezca.`);
    const others = (await client.query('SELECT COUNT(*) AS total FROM catalogos WHERE tipo = ? AND activo = 1 AND id_catalogo <> ?', [row.tipo, catalogId])).rows[0].total;
    if (!Number(others)) fail(409, 'CATALOG_LAST', 'La lista debe tener al menos una opción activa.');
    await client.query('DELETE FROM catalogos WHERE id_catalogo = ?', [catalogId]);
    await audit(client, req.user.id_usuario, 'catalogos', catalogId, 'eliminar_valor', { tipo: row.tipo, valor: row.valor });
  });
  invalidateCatalogs();
  res.json({ data: await catalogList() });
});

// ---------- Reportes de impacto ----------
function period(query) {
  const day = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
  const desde = day(query.desde), hasta = day(query.hasta);
  if (desde && hasta && desde > hasta) fail(422, 'INVALID_PERIOD', 'La fecha "desde" debe ser anterior a "hasta".');
  return { desde, hasta };
}
const between = (column, { desde, hasta }) => ({
  sql: [desde && `${column} >= ?`, hasta && `${column} < ? + INTERVAL 1 DAY`].filter(Boolean).join(' AND ') || '1 = 1',
  params: [desde, hasta].filter(Boolean)
});
adminRouter.get('/admin/reportes', async (req, res) => {
  const range = period(req.query);
  const created = between('d.fecha_creacion', range), closed = between('e.fecha_confirmacion', range);
  const count = rows => Object.fromEntries(rows.map(r => [r.clave, Number(r.total)]));
  const donaciones = count((await db.query(`SELECT d.estado AS clave, COUNT(*) AS total FROM donaciones d WHERE ${created.sql} GROUP BY d.estado`, created.params)).rows);
  const solicitudes = count((await db.query(`SELECT s.estado AS clave, COUNT(*) AS total FROM solicitudes s WHERE ${between('s.fecha_solicitud', range).sql} GROUP BY s.estado`, between('s.fecha_solicitud', range).params)).rows);
  const deliveredWhere = `e.estado IN ('confirmada','con_incidencia') AND ${closed.sql}`;
  const entregas = (await db.query(`SELECT e.fecha_confirmacion, e.estado AS resultado, d.id_donacion, d.nombre_alimento, d.categoria, d.cantidad, d.unidad, dt.nombre_establecimiento, dt.distrito,
      o.nombre AS beneficiaria, o.id_organizacion, o.numero_beneficiarios
    FROM entregas e JOIN donaciones d ON d.id_donacion = e.id_donacion JOIN donantes dt ON dt.id_donante = d.id_donante
    JOIN solicitudes s ON s.id_solicitud = e.id_solicitud JOIN organizaciones o ON o.id_organizacion = s.id_organizacion
    WHERE ${deliveredWhere} ORDER BY e.fecha_confirmacion DESC LIMIT 1000`, closed.params)).rows;
  const sum = (key, list) => Object.values(list.reduce((acc, row) => { const k = row[key] || 'Sin dato'; (acc[k] ||= { clave: k, entregas: 0 }).entregas++; return acc; }, {})).sort((a, b) => b.entregas - a.entregas);
  const porUnidad = Object.values(entregas.reduce((acc, row) => { (acc[row.unidad] ||= { unidad: row.unidad, cantidad: 0, entregas: 0 }); acc[row.unidad].cantidad += Number(row.cantidad); acc[row.unidad].entregas++; return acc; }, {}))
    .map(row => ({ ...row, cantidad: Math.round(row.cantidad * 100) / 100 })).sort((a, b) => b.entregas - a.entregas);
  // Estimación: suma de las personas que declaró atender cada beneficiaria que recibió al menos una donación.
  const people = [...new Map(entregas.map(row => [row.id_organizacion, Number(row.numero_beneficiarios) || 0])).values()].reduce((a, b) => a + b, 0);
  const notPicked = Number((await db.query(`SELECT COUNT(*) AS total FROM auditoria a WHERE a.tabla_afectada = 'solicitudes' AND a.accion IN ('no_recogida','cancelar_recojo','anular_recojo') AND ${between('a.fecha', range).sql}`, between('a.fecha', range).params)).rows[0].total);
  const cuentas = (await db.query(`SELECT u.rol, COALESCE(dt.estado_verificacion, o.estado_verificacion, 'pendiente') AS verificacion, u.estado, COUNT(*) AS total FROM usuarios u
    LEFT JOIN donantes dt ON dt.id_usuario = u.id_usuario LEFT JOIN organizaciones o ON o.id_usuario = u.id_usuario
    WHERE u.rol IN ('donante','organizacion') GROUP BY u.rol, verificacion, u.estado`)).rows.map(r => ({ ...r, total: Number(r.total) }));
  res.json({ data: {
    periodo: range, donaciones, solicitudes, cuentas,
    resumen: { entregas_completadas: entregas.filter(r => r.resultado === 'confirmada').length, entregas_con_problemas: entregas.filter(r => r.resultado === 'con_incidencia').length,
      recojos_anulados: notPicked, beneficiarias_atendidas: new Set(entregas.map(r => r.id_organizacion)).size, personas_estimadas: people },
    por_unidad: porUnidad, por_tipo: sum('categoria', entregas), por_distrito: sum('distrito', entregas),
    entregas: entregas.map(r => ({ fecha: r.fecha_confirmacion, id_donacion: r.id_donacion, alimento: r.nombre_alimento, tipo: r.categoria, cantidad: r.cantidad, unidad: r.unidad,
      donante: r.nombre_establecimiento, distrito: r.distrito, beneficiaria: r.beneficiaria, resultado: r.resultado === 'confirmada' ? 'Recibida' : 'Recibida con problemas' }))
  } });
});
