import { Router } from 'express';
import { db, transaction, audit, placeholders } from './db.js';
import { config } from './config.js';
import { requireAuth, requireRole, requireVerified, userFromRow, publicUser, canSignIn, isDemoEmail } from './auth.js';
import { fail } from './errors.js';
import { id, text, optionalText, number, date, donationInput, registrationProfile, registrationEmail, bool, phone, personName, words, optionalWords } from './validation.js';
import { createTracking, custodySummaries } from './custody.js';
import { evaluateLogistics, routeFromEvaluation, attachEvaluationDetails, pickupFromEvaluation, evaluationMatches } from './logistics.js';
import { attachPhotos, saveLocalPhoto, removeLocalPhoto, removeDonationFiles } from './photos.js';
import { unlink } from 'node:fs/promises';
import {
  ACTIVE_REQUEST_STATES, PENDING_REQUEST_STATES, COLD_CHAIN_MESSAGE, donationFromRow, toDonationColumns, requestFields,
  donorProfile, organizationProfile, evaluationFromRow, splitAddress, parseDetail, likePattern, likeEscape, localPhotoUrl, storedFoodTypes
} from './mappers.js';

const ELIGIBLE_USER = "u.estado IN ('activo','pendiente')";
// Catálogo de beneficiarias: nunca muestra donaciones canceladas, finalizadas, expiradas ni fuera de plazo.
const CATALOG = `d.estado = 'disponible' AND d.fecha_limite_recojo > NOW()
  AND (d.fecha_limite_aprovechamiento IS NULL OR d.fecha_limite_aprovechamiento > NOW())
  AND dt.estado_verificacion = 'verificado' AND ${ELIGIBLE_USER}`;
const DONATION_STATES = { vencida: 'expirada' };

async function attachPlans(rows, user, client = db) {
  if (!rows.length) return rows;
  const ids = rows.map(d => d.id_donacion);
  const params = [...ids];
  let org = '';
  if (user.rol === 'organizacion') { org = ' AND id_organizacion = ?'; params.push(user.perfil?.id_organizacion || -1); }
  const saved = (await client.query(`SELECT e.*, o.nombre AS destino_nombre, o.direccion AS destino_direccion, o.latitud AS actual_destino_latitud, o.longitud AS actual_destino_longitud
    FROM evaluaciones_ruta e JOIN organizaciones o ON o.id_organizacion = e.id_organizacion
    JOIN (SELECT MAX(id_evaluacion) AS id_evaluacion FROM evaluaciones_ruta
      WHERE id_donacion IN (${placeholders(ids)})${org} AND distancia_km IS NOT NULL AND duracion_estimada_min IS NOT NULL
      GROUP BY id_donacion) ultima ON ultima.id_evaluacion = e.id_evaluacion`, params)).rows;
  await attachEvaluationDetails(saved, client);
  const latest = new Map(saved.map(e => [e.id_donacion, e]));
  for (const d of rows) {
    const e = latest.get(d.id_donacion);
    if (!e) continue;
    if (!evaluationMatches(e, { latitud: d.latitud_recojo, longitud: d.longitud_recojo }, { latitud: e.actual_destino_latitud, longitud: e.actual_destino_longitud })) continue;
    const ruta = routeFromEvaluation(e);
    const input = { preparacion_min: 10, recojo_min: 10, entrega_min: 5, margen_seguridad_min: 15, demora_trafico_min: 0, ...(e.planificacion || {}) };
    if (d.cadena_custodia) { const t = d.cadena_custodia; Object.assign(input, { etapa_custodia: t.estado, condicion_declarada: t.condicion_declarada, incidencias_criticas: t.incidencias_criticas, incidencias_abiertas: t.incidencias_abiertas, fecha_propuesta: t.fecha_propuesta, dispone_cadena_frio: t.dispone_cadena_frio }); }
    const moved=['recogido','en_transito','entregado','confirmado'].includes(d.cadena_custodia?.estado);
    d.plan_ruta = { ruta, ruta_recojo: moved?null:pickupFromEvaluation(e), evaluacion: evaluateLogistics(d, ruta, input), id_organizacion: e.id_organizacion,
      destino: { nombre: e.destino_nombre, direccion: splitAddress(e.destino_direccion).direccion }, nota: 'Plan preliminar recalculado con el reloj del servidor; confirme conservación y condiciones antes de coordinar.' };
  }
  return rows;
}

const EXPIRED = `estado = 'disponible' AND (fecha_limite_recojo <= NOW() OR fecha_limite_aprovechamiento <= NOW())`;
export async function expireDonations() {
  if (!(await db.query(`SELECT id_donacion FROM donaciones WHERE ${EXPIRED} LIMIT 1`)).rowCount) return 0;
  return transaction(async client => {
    const expired = (await client.query(`SELECT id_donacion FROM donaciones WHERE ${EXPIRED} ORDER BY id_donacion FOR UPDATE`)).rows;
    for (const row of expired) {
      await client.query("UPDATE donaciones SET estado = 'expirada', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_donacion = ?", [row.id_donacion]);
      const pending = (await client.query(`SELECT id_solicitud FROM solicitudes WHERE id_donacion = ? AND estado IN (${placeholders(PENDING_REQUEST_STATES)}) ORDER BY id_solicitud FOR UPDATE`, [row.id_donacion, ...PENDING_REQUEST_STATES])).rows;
      for (const request of pending) {
        await client.query("UPDATE solicitudes SET estado = 'rechazada' WHERE id_solicitud = ?", [request.id_solicitud]);
        await audit(client, null, 'solicitudes', request.id_solicitud, 'rechazar_por_vencimiento', { id_donacion: row.id_donacion, motivo: 'La ventana de recojo de la donación venció.' });
      }
      await audit(client, null, 'donaciones', row.id_donacion, 'vencer', { motivo: 'Se alcanzó una fecha límite declarada.' });
    }
    return expired.length;
  });
}

const DONATION_SELECT = `SELECT d.*, dt.*, u.id_usuario, u.estado, u.correo,
  (SELECT COUNT(*) FROM solicitudes s WHERE s.id_donacion = d.id_donacion) AS solicitudes_count
  FROM donaciones d JOIN donantes dt ON dt.id_donante = d.id_donante JOIN usuarios u ON u.id_usuario = dt.id_usuario`;
async function loadDonations(where, params, user, client = db) {
  const rows = (await client.query(`${DONATION_SELECT} ${where}`, params, { nestTables: true })).rows;
  const list = rows.map(({ d, dt, u, '': extra }) => ({
    ...donationFromRow(d, dt),
    donante_nombre: dt.nombre_establecimiento, donante_id_usuario: dt.id_usuario,
    donante_estado_verificacion: dt.estado_verificacion, donante_estado: u.estado,
    donante: { id_donante: dt.id_donante, nombre_establecimiento: dt.nombre_establecimiento, direccion: splitAddress(dt.direccion).direccion,
      referencia: splitAddress(dt.direccion).referencia, distrito: dt.distrito, latitud: dt.latitud, longitud: dt.longitud,
      foto_url: localPhotoUrl(dt.foto_local), es_demostracion: isDemoEmail(u.correo) },
    solicitudes_count: Number(extra.solicitudes_count),
    cadena_custodia: null
  }));
  await attachPhotos(list, client);
  const custody = await custodySummaries(list.map(d => d.id_donacion), client);
  for (const d of list) d.cadena_custodia = custody.get(d.id_donacion) || null;
  return attachPlans(list, user, client);
}

const REQUEST_SELECT = `SELECT s.*, d.*, dt.*, o.*,
  (SELECT e.id_entrega FROM entregas e WHERE e.id_solicitud = s.id_solicitud LIMIT 1) AS id_seguimiento
  FROM solicitudes s JOIN donaciones d ON d.id_donacion = s.id_donacion
  JOIN donantes dt ON dt.id_donante = d.id_donante JOIN organizaciones o ON o.id_organizacion = s.id_organizacion`;
const DECISIONS = ['crear', 'reenviar', 'aceptar', 'rechazar', 'cancelar', 'rechazar_no_seleccionada', 'rechazar_por_vencimiento', 'cancelar_por_donacion'];
// La tabla solicitudes no guarda motivo ni fecha de decisión: se recuperan de auditoria.
async function attachDecisions(requests, client) {
  if (!requests.length) return;
  const ids = requests.map(r => r.id_solicitud);
  const rows = (await client.query(`SELECT id_registro, accion, descripcion, fecha FROM auditoria
    WHERE tabla_afectada = 'solicitudes' AND id_registro IN (${placeholders(ids)}) AND accion IN (${placeholders(DECISIONS)})
    ORDER BY id_auditoria`, [...ids, ...DECISIONS])).rows;
  const last = new Map(rows.map(row => [row.id_registro, row]));
  for (const r of requests) {
    const event = last.get(r.id_solicitud);
    if (!event) continue;
    r.fecha_actualizacion = event.fecha;
    if (!['crear', 'reenviar'].includes(event.accion)) r.motivo_decision = parseDetail(event.descripcion).motivo || null;
  }
}
async function loadRequests(where, params, client = db) {
  const rows = (await client.query(`${REQUEST_SELECT} ${where}`, params, { nestTables: true })).rows;
  const list = rows.map(({ s, d, dt, o, '': extra }) => ({
    ...requestFields(s), alimento: d.nombre_alimento, cantidad: d.cantidad, unidad: d.unidad, donacion_estado: d.estado,
    donante_nombre: dt.nombre_establecimiento, organizacion_nombre: o.nombre,
    donacion: donationFromRow(d, dt), organizacion: organizationProfile(o), donante: donorProfile(dt), evaluacion_ruta: null,
    id_seguimiento: extra?.id_seguimiento || null
  }));
  if (!list.length) return list;
  await attachPhotos(list.map(r => r.donacion), client);
  await attachDecisions(list, client);
  const ids = list.map(r => r.id_solicitud);
  const evaluations = (await client.query(`SELECT e.* FROM evaluaciones_ruta e JOIN (SELECT MAX(id_evaluacion) AS id_evaluacion FROM evaluaciones_ruta
    WHERE id_solicitud IN (${placeholders(ids)}) GROUP BY id_solicitud) ultima ON ultima.id_evaluacion = e.id_evaluacion`, ids)).rows;
  const byRequest = new Map(evaluations.map(e => [e.id_solicitud, e]));
  for (const r of list) r.evaluacion_ruta = evaluationFromRow(byRequest.get(r.id_solicitud));
  return list;
}

function donationOwner(req, donation) {
  if (req.user.rol !== 'donante' || req.user.perfil?.id_donante !== donation.id_donante)
    fail(403, 'NOT_OWNER', 'Solo el donante propietario puede modificar esta donación.');
}
async function lockedDonation(client, donationId) {
  const row = (await client.query('SELECT * FROM donaciones WHERE id_donacion = ? FOR UPDATE', [donationId])).rows[0];
  if (!row) fail(404, 'DONATION_NOT_FOUND', 'No se encontró la donación.');
  return row;
}
function checkAvailable(donation) {
  if (donation.estado !== 'disponible' || Date.parse(donation.fecha_limite_recojo) <= Date.now() ||
      (donation.fecha_limite_aprovechamiento && Date.parse(donation.fecha_limite_aprovechamiento) <= Date.now()))
    fail(409, 'DONATION_UNAVAILABLE', 'La donación ya no está disponible para nuevas solicitudes o decisiones.');
}

export const businessRouter = Router();
businessRouter.use(requireAuth);
businessRouter.get('/donaciones', async (req, res) => {
  await expireDonations();
  const conditions = [], params = [];
  const add = (sql, ...values) => { conditions.push(sql); params.push(...values); };
  if (req.user.rol === 'donante') add('d.id_donante = ?', req.user.perfil?.id_donante || -1);
  else if (req.user.rol === 'organizacion') conditions.push(CATALOG);
  if (req.query.q) add("CONCAT_WS(' ', d.nombre_alimento, d.descripcion, dt.nombre_establecimiento) LIKE ?", likePattern(String(req.query.q).slice(0, 150)));
  if (req.query.categoria) { const names = storedFoodTypes(String(req.query.categoria).slice(0, 100)); add(`d.categoria IN (${placeholders(names)})`, ...names); }
  if (req.query.distrito) add('dt.distrito = ?', String(req.query.distrito).slice(0, 100));
  if (req.query.estado) { const estado = String(req.query.estado); add('d.estado = ?', DONATION_STATES[estado] || estado); }
  const where = `${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY d.fecha_creacion DESC, d.id_donacion DESC LIMIT 200`;
  res.json({ data: await loadDonations(where, params, req.user) });
});

businessRouter.get('/donaciones/:id', async (req, res) => {
  await expireDonations();
  const [row] = await loadDonations('WHERE d.id_donacion = ?', [id(req.params.id)], req.user);
  if (!row) fail(404, 'DONATION_NOT_FOUND', 'No se encontró la donación.');
  if (req.user.rol === 'donante' && row.id_donante !== req.user.perfil?.id_donante) fail(403, 'NOT_OWNER', 'No tiene permiso para consultar esta donación.');
  const orgId = req.user.perfil?.id_organizacion || -1;
  if (req.user.rol === 'organizacion' && (row.estado !== 'disponible' || row.donante_estado_verificacion !== 'verificado' || !canSignIn(row.donante_estado))) {
    const own = await db.query('SELECT 1 FROM solicitudes WHERE id_donacion = ? AND id_organizacion = ?', [row.id_donacion, orgId]);
    if (!own.rowCount) fail(403, 'FORBIDDEN', 'La donación no está disponible en el catálogo.');
  }
  row.solicitudes = req.user.rol === 'organizacion'
    ? await loadRequests('WHERE s.id_donacion = ? AND s.id_organizacion = ? ORDER BY s.fecha_solicitud DESC, s.id_solicitud DESC', [row.id_donacion, orgId])
    : await loadRequests('WHERE s.id_donacion = ? ORDER BY s.fecha_solicitud DESC, s.id_solicitud DESC', [row.id_donacion]);
  if (row.estado === 'cancelada') {
    const canceled = (await db.query("SELECT descripcion FROM auditoria WHERE tabla_afectada = 'donaciones' AND id_registro = ? AND accion = 'cancelar' ORDER BY id_auditoria DESC LIMIT 1", [row.id_donacion])).rows[0];
    row.motivo_cancelacion = canceled ? parseDetail(canceled.descripcion).motivo || null : null;
  }
  res.json({ data: row });
});

businessRouter.post('/donaciones', requireRole('donante'), async (req, res) => {
  requireVerified(req);
  const value = donationInput(req.body);
  const columns = Object.entries(toDonationColumns(value, req.user.perfil));
  const donationId = await transaction(async client => {
    const created = await client.query(`INSERT INTO donaciones (id_donante, ${columns.map(([key]) => key).join(', ')})
      VALUES (?, ${columns.map(() => '?').join(', ')})`, [req.user.perfil.id_donante, ...columns.map(([, v]) => v)]);
    await client.query("INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, 'publicada', ?, ?)",
      [created.insertId, req.user.id_usuario, req.user.perfil.nombre_establecimiento.slice(0, 150), 'Donación publicada por el donante.']);
    await audit(client, req.user.id_usuario, 'donaciones', created.insertId, 'crear', { alimento: value.alimento });
    return created.insertId;
  });
  const [row] = await loadDonations('WHERE d.id_donacion = ?', [donationId], req.user);
  res.status(201).json({ data: row });
});
businessRouter.patch('/donaciones/:id', requireRole('donante'), async (req, res) => {
  requireVerified(req);
  await expireDonations();
  const donationId = await transaction(async client => {
    const existing = await lockedDonation(client, id(req.params.id));
    donationOwner(req, existing);
    checkAvailable(existing);
    if ((await client.query(`SELECT 1 FROM solicitudes WHERE id_donacion = ? AND estado IN (${placeholders(ACTIVE_REQUEST_STATES)}) LIMIT 1`, [existing.id_donacion, ...ACTIVE_REQUEST_STATES])).rowCount)
      fail(409, 'DONATION_HAS_REQUESTS', 'No se puede editar una donación con solicitudes activas. Cancele la publicación con un motivo si las condiciones cambiaron.');
    const value = donationInput({ ...donationFromRow(existing, req.user.perfil), ...req.body });
    const columns = Object.entries(toDonationColumns(value, req.user.perfil));
    await client.query(`UPDATE donaciones SET ${columns.map(([key]) => `${key} = ?`).join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id_donacion = ?`, [...columns.map(([, v]) => v), existing.id_donacion]);
    await audit(client, req.user.id_usuario, 'donaciones', existing.id_donacion, 'editar', { campos: Object.keys(req.body) });
    return existing.id_donacion;
  });
  const [row] = await loadDonations('WHERE d.id_donacion = ?', [donationId], req.user);
  res.json({ data: row });
});
businessRouter.post('/donaciones/:id/cancelar', requireRole('donante'), async (req, res) => {
  const motivo = text(req.body.motivo, 'motivo de cancelación', 5, 1000);
  await expireDonations();
  const donationId = await transaction(async client => {
    const existing = await lockedDonation(client, id(req.params.id));
    donationOwner(req, existing);
    if (!['disponible', 'en_proceso'].includes(existing.estado)) fail(409, 'INVALID_STATE', 'La donación ya está cancelada, finalizada o vencida.');
    const delivery = (await client.query('SELECT estado FROM entregas WHERE id_donacion = ? FOR UPDATE', [existing.id_donacion])).rows[0];
    if (delivery && delivery.estado !== 'pendiente') fail(409, 'CUSTODY_STARTED', 'El recojo ya fue registrado. Gestione el problema mediante una incidencia para conservar la cadena de custodia.');
    await client.query("UPDATE donaciones SET estado = 'cancelada', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_donacion = ?", [existing.id_donacion]);
    const affected = (await client.query(`SELECT id_solicitud FROM solicitudes WHERE id_donacion = ? AND estado IN (${placeholders(ACTIVE_REQUEST_STATES)}) ORDER BY id_solicitud FOR UPDATE`, [existing.id_donacion, ...ACTIVE_REQUEST_STATES])).rows;
    for (const request of affected) {
      await client.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id_solicitud = ?", [request.id_solicitud]);
      await audit(client, req.user.id_usuario, 'solicitudes', request.id_solicitud, 'cancelar_por_donacion', { motivo: `Donante canceló la donación: ${motivo}` });
    }
    await audit(client, req.user.id_usuario, 'donaciones', existing.id_donacion, 'cancelar', { motivo });
    return existing.id_donacion;
  });
  const [row] = await loadDonations('WHERE d.id_donacion = ?', [donationId], req.user);
  res.json({ data: { ...row, motivo_cancelacion: motivo } });
});
// Eliminar solo es posible si ninguna beneficiaria la solicitó: así no se borra el historial de nadie más.
businessRouter.delete('/donaciones/:id', requireRole('donante'), async (req, res) => {
  const donationId = id(req.params.id);
  const files = await transaction(async client => {
    const existing = await lockedDonation(client, donationId);
    donationOwner(req, existing);
    if ((await client.query('SELECT 1 FROM solicitudes WHERE id_donacion = ? LIMIT 1', [donationId])).rowCount)
      fail(409, 'DONATION_HAS_REQUESTS', 'Esta donación ya recibió solicitudes y no se puede eliminar, para conservar el historial de las beneficiarias. Puedes cancelarla.');
    const photos = (await client.query('SELECT nombre_archivo FROM donacion_fotos WHERE id_donacion = ?', [donationId])).rows.map(row => row.nombre_archivo);
    for (const table of ['evaluaciones_ruta', 'notificaciones', 'seguimientos', 'donacion_fotos'])
      await client.query(`DELETE FROM ${table} WHERE id_donacion = ?`, [donationId]);
    await client.query('DELETE FROM donaciones WHERE id_donacion = ?', [donationId]);
    await audit(client, req.user.id_usuario, 'donaciones', donationId, 'eliminar', { alimento: existing.nombre_alimento });
    return photos;
  });
  await removeDonationFiles(files);
  res.json({ data: { id_donacion: donationId, eliminada: true } });
});

businessRouter.get('/solicitudes', async (req, res) => {
  await expireDonations();
  const params = [], conditions = [];
  if (req.user.rol === 'donante') { params.push(req.user.perfil?.id_donante || -1); conditions.push('d.id_donante = ?'); }
  else if (req.user.rol === 'organizacion') { params.push(req.user.perfil?.id_organizacion || -1); conditions.push('s.id_organizacion = ?'); }
  if (req.query.id_donacion) { params.push(id(req.query.id_donacion)); conditions.push('s.id_donacion = ?'); }
  if (req.query.estado) { params.push(String(req.query.estado)); conditions.push('s.estado = ?'); }
  res.json({ data: await loadRequests(`${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY s.fecha_solicitud DESC, s.id_solicitud DESC LIMIT 200`, params) });
});
function requestInput(body) {
  return {
    responsable_recojo: personName(body.responsable_recojo, 'nombre de quien recoge'),
    telefono: phone(body.telefono),
    transporte_declarado: words(body.transporte_declarado, 'transporte', 2, 100),
    recipiente_declarado: words(body.recipiente_declarado, 'recipiente', 2, 100),
    dispone_cadena_frio: bool(body.dispone_cadena_frio ?? false, 'dispone_cadena_frio'),
    fecha_propuesta: date(body.fecha_propuesta, 'fecha propuesta'),
    observaciones: optionalWords(body.observaciones, 'observaciones'),
    tiempo_llegada_min: arrivalMinutes(body.tiempo_llegada_min)
  };
}
// Lo declara la beneficiaria según cómo irá (combi, mototaxi, a pie): no se calcula con un servicio de rutas.
function arrivalMinutes(value) {
  const minutes = number(value, 'tiempo de llegada', 1, 600);
  if (!Number.isInteger(minutes)) fail(422, 'VALIDATION_ERROR', 'El tiempo de llegada debe ser un número entero de minutos.');
  return minutes;
}
function checkPickupTime(value, donation) {
  const proposed = Date.parse(value.fecha_propuesta);
  if (proposed < Date.now() || proposed < Date.parse(donation.fecha_disponibilidad) || proposed > Date.parse(donation.fecha_limite_recojo))
    fail(422, 'INVALID_PICKUP_TIME', 'La fecha propuesta debe estar en el futuro y dentro de la ventana de disponibilidad y recojo.');
}
const requestColumns = (value, donation) => ({
  cantidad_solicitada: donation.cantidad, responsable_recojo: value.responsable_recojo, telefono_recojo: value.telefono,
  fecha_recojo_propuesta: new Date(value.fecha_propuesta), tipo_transporte: value.transporte_declarado, recipiente: value.recipiente_declarado,
  mensaje: value.dispone_cadena_frio ? COLD_CHAIN_MESSAGE : null, observaciones: value.observaciones || null,
  tiempo_llegada_min: value.tiempo_llegada_min
});
// La beneficiaria dueña de la solicitud, bloqueando primero la donación (mismo orden que las decisiones).
async function ownRequest(client, req, requestId) {
  const reference = (await client.query('SELECT id_donacion FROM solicitudes WHERE id_solicitud = ?', [requestId])).rows[0];
  if (!reference) fail(404, 'REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
  const donation = await lockedDonation(client, reference.id_donacion);
  const request = (await client.query('SELECT * FROM solicitudes WHERE id_solicitud = ? FOR UPDATE', [requestId])).rows[0];
  if (request.id_organizacion !== req.user.perfil?.id_organizacion) fail(403, 'NOT_OWNER', 'Solo la beneficiaria solicitante puede modificar su solicitud.');
  return { donation, request };
}

businessRouter.patch('/solicitudes/:id', requireRole('organizacion'), async (req, res) => {
  requireVerified(req);
  const value = requestInput(req.body);
  const requestId = id(req.params.id);
  await expireDonations();
  await transaction(async client => {
    const { donation, request } = await ownRequest(client, req, requestId);
    if (!PENDING_REQUEST_STATES.includes(request.estado)) fail(409, 'INVALID_STATE', 'Solo se pueden editar solicitudes pendientes. Si ya fue respondida, envía una nueva.');
    checkAvailable(donation);
    checkPickupTime(value, donation);
    const entries = Object.entries(requestColumns(value, donation));
    await client.query(`UPDATE solicitudes SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id_solicitud = ?`, [...entries.map(([, v]) => v), requestId]);
    await audit(client, req.user.id_usuario, 'solicitudes', requestId, 'editar', { id_donacion: donation.id_donacion, cadena_frio_declarada: value.dispone_cadena_frio });
  });
  const [row] = await loadRequests('WHERE s.id_solicitud = ?', [requestId]);
  res.json({ data: row });
});
// Una solicitud aceptada ya tiene recojo y custodia: esa no se elimina, se gestiona desde el seguimiento.
businessRouter.delete('/solicitudes/:id', requireRole('organizacion'), async (req, res) => {
  const requestId = id(req.params.id);
  await transaction(async client => {
    const { donation, request } = await ownRequest(client, req, requestId);
    if (request.estado === 'aceptada') fail(409, 'REQUEST_ACCEPTED', 'Esta solicitud ya fue aceptada y no se puede eliminar. Coordina con el donante desde el seguimiento.');
    for (const table of ['asignaciones', 'entregas', 'incidencias'])
      if ((await client.query(`SELECT 1 FROM ${table} WHERE id_solicitud = ? LIMIT 1`, [requestId])).rowCount)
        fail(409, 'REQUEST_HAS_HISTORY', 'Esta solicitud tiene recojo o incidencias registradas y no se puede eliminar.');
    await client.query('DELETE FROM notificaciones WHERE id_solicitud = ?', [requestId]);
    await client.query('DELETE FROM solicitudes WHERE id_solicitud = ?', [requestId]);
    await audit(client, req.user.id_usuario, 'solicitudes', requestId, 'eliminar', { id_donacion: donation.id_donacion, estado_anterior: request.estado });
  });
  res.json({ data: { id_solicitud: requestId, eliminada: true } });
});

businessRouter.post('/donaciones/:id/solicitudes', requireRole('organizacion'), async (req, res) => {
  requireVerified(req);
  const value = requestInput(req.body);
  await expireDonations();
  const requestId = await transaction(async client => {
    const donation = await lockedDonation(client, id(req.params.id));
    checkAvailable(donation);
    const verifiedDonor = await client.query(`SELECT 1 FROM donantes d JOIN usuarios u ON u.id_usuario = d.id_usuario
      WHERE d.id_donante = ? AND d.estado_verificacion = 'verificado' AND ${ELIGIBLE_USER}`, [donation.id_donante]);
    if (!verifiedDonor.rowCount) fail(409, 'DONOR_UNAVAILABLE', 'El perfil donante no está habilitado para recibir solicitudes.');
    checkPickupTime(value, donation);
    const organizationId = req.user.perfil.id_organizacion;
    const entries = Object.entries(requestColumns(value, donation));
    // solicitudes tiene UNIQUE(id_donacion, id_organizacion): una solicitud rechazada o cancelada se reenvía en la misma fila.
    const previous = (await client.query('SELECT id_solicitud, estado FROM solicitudes WHERE id_donacion = ? AND id_organizacion = ? FOR UPDATE', [donation.id_donacion, organizationId])).rows[0];
    let requestId;
    if (previous) {
      if (ACTIVE_REQUEST_STATES.includes(previous.estado)) fail(409, 'REQUEST_EXISTS', 'Tu entidad beneficiaria ya tiene una solicitud activa para esta donación.');
      await client.query(`UPDATE solicitudes SET ${entries.map(([key]) => `${key} = ?`).join(', ')}, estado = 'pendiente', fecha_solicitud = CURRENT_TIMESTAMP
        WHERE id_solicitud = ?`, [...entries.map(([, v]) => v), previous.id_solicitud]);
      requestId = previous.id_solicitud;
      await audit(client, req.user.id_usuario, 'solicitudes', requestId, 'reenviar', { id_donacion: donation.id_donacion, estado_anterior: previous.estado, cadena_frio_declarada: value.dispone_cadena_frio });
    } else {
      const created = await client.query(`INSERT INTO solicitudes (id_donacion, id_organizacion, ${entries.map(([key]) => key).join(', ')}, estado)
        VALUES (?, ?, ${entries.map(() => '?').join(', ')}, 'pendiente')`, [donation.id_donacion, organizationId, ...entries.map(([, v]) => v)]);
      requestId = created.insertId;
      await audit(client, req.user.id_usuario, 'solicitudes', requestId, 'crear', { id_donacion: donation.id_donacion, cadena_frio_declarada: value.dispone_cadena_frio });
    }
    await client.query("INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, 'solicitud_recibida', ?, ?)",
      [donation.id_donacion, req.user.id_usuario, String(req.user.perfil.nombre || '').slice(0, 150), `Solicitud #${requestId} registrada por la beneficiaria.`]);
    return requestId;
  });
  const row = (await db.query('SELECT * FROM solicitudes WHERE id_solicitud = ?', [requestId])).rows[0];
  res.status(201).json({ data: requestFields(row) });
});

const NEXT_STATE = { aceptar: 'aceptada', rechazar: 'rechazada', cancelar: 'cancelada' };
for (const action of ['aceptar', 'rechazar', 'cancelar']) {
  businessRouter.post(`/solicitudes/:id/${action}`, requireRole(action === 'cancelar' ? 'organizacion' : 'donante'), async (req, res) => {
    const requestId = id(req.params.id);
    const indicated = req.body.id_donacion == null || req.body.id_donacion === '' ? null : id(req.body.id_donacion);
    const motivo = action === 'aceptar' ? optionalText(req.body.motivo, 'motivo', 1000) : text(req.body.motivo, 'motivo', 5, 1000);
    await expireDonations();
    await transaction(async client => {
      const reference = (await client.query('SELECT id_donacion FROM solicitudes WHERE id_solicitud = ?', [requestId])).rows[0];
      if (!reference) fail(404, 'REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
      // Todas las decisiones bloquean primero la misma donación. La segunda aceptación espera y ve el estado actualizado.
      const donation = await lockedDonation(client, reference.id_donacion);
      const request = (await client.query('SELECT * FROM solicitudes WHERE id_solicitud = ? FOR UPDATE', [requestId])).rows[0];
      if (request.id_donacion !== donation.id_donacion || (indicated && indicated !== request.id_donacion))
        fail(409, 'REQUEST_DONATION_MISMATCH', 'La solicitud no pertenece a la donación indicada.');
      if (action === 'cancelar') {
        if (request.id_organizacion !== req.user.perfil?.id_organizacion) fail(403, 'NOT_OWNER', 'Solo la beneficiaria solicitante puede cancelar su solicitud.');
      } else donationOwner(req, donation);
      if (!PENDING_REQUEST_STATES.includes(request.estado)) fail(409, 'INVALID_STATE', 'Solo se pueden modificar solicitudes pendientes.');
      if (action !== 'cancelar') checkAvailable(donation);
      if (action === 'aceptar') {
        if ((await client.query('SELECT 1 FROM asignaciones WHERE id_donacion = ? FOR UPDATE', [donation.id_donacion])).rowCount)
          fail(409, 'DONATION_ASSIGNED', 'La donación ya tiene una solicitud asignada.');
        await client.query("UPDATE solicitudes SET estado = 'aceptada' WHERE id_solicitud = ?", [requestId]);
        const competitors = (await client.query(`SELECT id_solicitud FROM solicitudes WHERE id_donacion = ? AND id_solicitud <> ? AND estado IN (${placeholders(PENDING_REQUEST_STATES)}) ORDER BY id_solicitud FOR UPDATE`,
          [donation.id_donacion, requestId, ...PENDING_REQUEST_STATES])).rows;
        for (const other of competitors) {
          await client.query("UPDATE solicitudes SET estado = 'rechazada' WHERE id_solicitud = ?", [other.id_solicitud]);
          await audit(client, req.user.id_usuario, 'solicitudes', other.id_solicitud, 'rechazar_no_seleccionada', { motivo: 'Otra solicitud fue seleccionada.', id_solicitud_aceptada: requestId });
        }
        await client.query("UPDATE donaciones SET estado = 'en_proceso', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_donacion = ?", [donation.id_donacion]);
        try {
          // id_donacion es UNIQUE en asignaciones: impide dos asignaciones aunque se ejecuten a la vez.
          const assignment = await client.query('INSERT INTO asignaciones (id_donacion, id_solicitud) VALUES (?, ?)', [donation.id_donacion, requestId]);
          await audit(client, req.user.id_usuario, 'asignaciones', assignment.insertId, 'asignar', { id_donacion: donation.id_donacion, id_solicitud: requestId });
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') fail(409, 'DONATION_ASSIGNED', 'La donación ya tiene una solicitud asignada.');
          throw error;
        }
        await audit(client, req.user.id_usuario, 'donaciones', donation.id_donacion, 'iniciar_proceso', { id_solicitud: requestId });
        await createTracking(client, requestId, req.user.id_usuario);
      } else await client.query('UPDATE solicitudes SET estado = ? WHERE id_solicitud = ?', [NEXT_STATE[action], requestId]);
      await audit(client, req.user.id_usuario, 'solicitudes', requestId, action, { motivo: motivo || null, id_donacion: donation.id_donacion });
    });
    const [row] = await loadRequests('WHERE s.id_solicitud = ?', [requestId]);
    res.json({ data: row });
  });
}

// El DNI solo se entrega a su propio dueño: los perfiles que ve la otra parte no lo incluyen.
const profileTable = role => role === 'donante' ? 'donantes' : 'organizaciones';
async function ownProfile(user, client = db) {
  if (user.rol === 'administrador' || !user.perfil) return user.perfil || {};
  const row = (await client.query(`SELECT dni_representante FROM ${profileTable(user.rol)} WHERE id_usuario = ?`, [user.id_usuario])).rows[0];
  return { ...user.perfil, dni_representante: row?.dni_representante || '' };
}
businessRouter.get('/perfil', async (req, res) => res.json({ data: { usuario: publicUser(req.user), perfil: await ownProfile(req.user) } }));
businessRouter.patch('/perfil', async (req, res) => {
  const nombre = personName(req.body.nombre ?? req.user.nombre, 'nombre');
  const telefono = phone(req.body.telefono ?? req.user.telefono);
  const correo = req.body.correo == null || req.body.correo === req.user.correo ? req.user.correo : registrationEmail(req.body.correo);
  // Las cuentas de prueba conservan su correo: el inicio de sesión de demostración depende de él.
  if (correo !== req.user.correo && isDemoEmail(req.user.correo)) fail(409, 'DEMO_EMAIL_LOCKED', 'El correo de una cuenta de prueba no se puede cambiar.');
  const next = req.user.rol === 'administrador' ? null
    : registrationProfile({ ...req.body, perfil: { ...req.user.perfil, ruc: undefined, tipo_organizacion: undefined, numero_beneficiarios: undefined, ...(req.body.perfil || req.body) } }, req.user.rol, true);
  // Foto nueva opcional: se guarda antes y, si algo falla, se borra; la anterior se borra solo al confirmar.
  const photo = next && req.body.foto ? await saveLocalPhoto(req.body.foto) : null;
  let previousPhoto = null, result;
  try {
    result = await transaction(async client => {
      if (correo !== req.user.correo && (await client.query('SELECT 1 FROM usuarios WHERE correo = ? AND id_usuario <> ?', [correo, req.user.id_usuario])).rowCount)
        fail(409, 'EMAIL_IN_USE', 'Ya existe otra cuenta registrada con este correo.');
      let changedLocation = false;
      if (next) {
        const table = profileTable(req.user.rol);
        const current = (await client.query(`SELECT direccion, distrito, latitud, longitud, foto_local FROM ${table} WHERE id_usuario = ? FOR UPDATE`, [req.user.id_usuario])).rows[0] || {};
        changedLocation = ['direccion', 'distrito', 'latitud', 'longitud'].some(key => String(current[key] ?? '') !== String(next[key] ?? ''));
        if (photo) { next.foto_local = photo.relativePath; previousPhoto = current.foto_local; }
        const entries = Object.entries(next);
        await client.query(`UPDATE ${table} SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id_usuario = ?`, [...entries.map(([, value]) => value), req.user.id_usuario]);
      }
      // El formulario usa un solo campo de nombre: si cambia, se guarda completo en "nombres".
      if (nombre !== req.user.nombre) await client.query('UPDATE usuarios SET nombres = ?, apellidos = NULL, telefono = ?, correo = ? WHERE id_usuario = ?', [nombre, telefono, correo, req.user.id_usuario]);
      else await client.query('UPDATE usuarios SET telefono = ?, correo = ? WHERE id_usuario = ?', [telefono, correo, req.user.id_usuario]);
      await audit(client, req.user.id_usuario, 'usuarios', req.user.id_usuario, 'editar_perfil', { ubicacion_actualizada: changedLocation, correo_actualizado: correo !== req.user.correo, foto_actualizada: Boolean(photo) });
      const user = await userFromRow((await client.query('SELECT * FROM usuarios WHERE id_usuario = ?', [req.user.id_usuario])).rows[0], client);
      return { usuario: publicUser(user), perfil: await ownProfile(user, client) };
    });
  } catch (error) {
    if (photo) await unlink(photo.destination).catch(cleanup => console.error('No se pudo eliminar la foto de perfil no guardada:', cleanup.message));
    throw error;
  }
  if (previousPhoto && previousPhoto !== photo?.relativePath) await removeLocalPhoto(previousPhoto);
  res.json({ data: result });
});

const AUDIT_ENTITIES = { usuario: 'usuarios', donacion: 'donaciones', solicitud: 'solicitudes', seguimiento: 'entregas', incidencia: 'incidencias', foto: 'donacion_fotos' };
businessRouter.get('/auditoria', async (req, res) => {
  const conditions = [], params = [];
  if (req.user.rol === 'donante') {
    const donor = req.user.perfil?.id_donante || -1;
    params.push(req.user.id_usuario, donor, donor);
    conditions.push(`(a.id_usuario = ? OR (a.tabla_afectada = 'donaciones' AND a.id_registro IN (SELECT id_donacion FROM donaciones WHERE id_donante = ?))
      OR (a.tabla_afectada = 'solicitudes' AND a.id_registro IN (SELECT s.id_solicitud FROM solicitudes s JOIN donaciones d ON d.id_donacion = s.id_donacion WHERE d.id_donante = ?)))`);
  } else if (req.user.rol === 'organizacion') {
    params.push(req.user.id_usuario, req.user.perfil?.id_organizacion || -1);
    conditions.push(`(a.id_usuario = ? OR (a.tabla_afectada = 'solicitudes' AND a.id_registro IN (SELECT id_solicitud FROM solicitudes WHERE id_organizacion = ?)))`);
  }
  if (req.query.entidad) { const entity = String(req.query.entidad); params.push(AUDIT_ENTITIES[entity] || entity); conditions.push('a.tabla_afectada = ?'); }
  if (req.query.id_entidad) { params.push(id(req.query.id_entidad)); conditions.push('a.id_registro = ?'); }
  const rows = (await db.query(`SELECT a.*, u.nombres, u.apellidos FROM auditoria a LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY a.fecha DESC, a.id_auditoria DESC LIMIT 200`, params)).rows;
  res.json({ data: rows.map(a => ({
    id_evento: a.id_auditoria, id_auditoria: a.id_auditoria, id_usuario: a.id_usuario, modulo: a.modulo,
    entidad: a.tabla_afectada, tabla_afectada: a.tabla_afectada, id_entidad: a.id_registro, id_registro: a.id_registro,
    accion: a.accion, fecha_evento: a.fecha, fecha: a.fecha, detalle: parseDetail(a.descripcion),
    usuario_nombre: [a.nombres, a.apellidos].filter(Boolean).join(' ') || null
  })) });
});

export async function getStats() {
  await expireDonations();
  const row = (await db.query(`SELECT
    (SELECT COUNT(*) FROM usuarios) AS usuarios,
    (SELECT COUNT(*) FROM donantes) AS donantes,
    (SELECT COUNT(*) FROM organizaciones) AS organizaciones,
    (SELECT COUNT(*) FROM donaciones) AS donaciones,
    (SELECT COUNT(*) FROM donaciones WHERE estado = 'disponible') AS disponibles,
    (SELECT COUNT(*) FROM donaciones WHERE estado = 'en_proceso') AS en_proceso,
    (SELECT COUNT(*) FROM donaciones WHERE estado = 'finalizada') AS finalizadas,
    (SELECT COUNT(*) FROM solicitudes) AS solicitudes,
    (SELECT COUNT(*) FROM solicitudes WHERE estado = 'pendiente') AS solicitudes_pendientes,
    (SELECT COUNT(*) FROM evaluaciones_ruta) AS evaluaciones_logisticas,
    (SELECT COUNT(*) FROM usuarios WHERE correo LIKE ?) AS cuentas_demostracion`, [`%${likeEscape(`@${config.demoEmailDomain}`)}`])).rows[0];
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}
businessRouter.get('/admin/stats', requireRole('administrador'), async (req, res) => res.json({ data: await getStats() }));
