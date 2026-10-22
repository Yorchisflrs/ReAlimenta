import { Router } from 'express';
import { db, transaction, audit, placeholders } from './db.js';
import { requireAuth, requireRole, isDemoEmail, fullName } from './auth.js';
import { fail } from './errors.js';
import { id, text, optionalText, number, bool } from './validation.js';
import { calculateJourney, evaluateLogistics, routeFromEvaluation, saveEvaluation, attachEvaluationDetails, pickupFromEvaluation, evaluationMatches } from './logistics.js';
import { attachPhotos } from './photos.js';
import { donationFromRow, splitAddress, coldChainDeclared, parseDetail, evaluationFromRow } from './mappers.js';

// Modelo MySQL de la cadena de custodia:
//  - entregas: una fila por donación asignada, con su estado y los responsables actuales.
//  - seguimientos: hitos de la donación (la aplicación solo inserta; nunca reescribe ni borra).
//  - incidencias: problemas reportados durante la entrega.
// Lugar, condición, temperatura, severidad, título y resolución no tienen columna propia: se guardan
// en auditoria.descripcion dentro de la misma transacción y se leen desde allí.
const TRANSITIONS = { preparacion: 'listo', listo: 'recogido', recogido: 'en_transito', en_transito: 'entregado', entregado: 'confirmado' };
const EVENT_STAGE = { aceptacion: 'solicitud_aceptada', listo: 'lista_recojo', recogido: 'en_recojo', en_transito: 'en_traslado', entregado: 'entregada', confirmado: 'recepcion_confirmada' };
const OBSERVATION_STAGE = { preparacion: 'preparando', listo: 'lista_recojo', recogido: 'en_recojo', en_transito: 'en_traslado', entregado: 'entregada', confirmado: 'recepcion_confirmada' };
const STATE_OF_STAGE = { solicitud_aceptada: 'preparacion', preparando: 'preparacion', lista_recojo: 'listo', en_recojo: 'recogido', en_traslado: 'en_transito', entregada: 'entregado', recepcion_confirmada: 'confirmado', finalizada: 'confirmado' };
const TYPE_OF_STAGE = { solicitud_aceptada: 'aceptacion', preparando: 'observacion', lista_recojo: 'listo', en_recojo: 'recogido', en_traslado: 'en_transito', entregada: 'entregado', recepcion_confirmada: 'confirmado', finalizada: 'confirmado' };
const DELIVERY_STATE = { preparacion: 'pendiente', listo: 'pendiente', recogido: 'en_recojo', en_transito: 'en_traslado', entregado: 'entregada', confirmado: 'confirmada' };
const CUSTODY_STAGES = Object.keys(STATE_OF_STAGE);
const EVENT_TYPES = ['aceptacion', 'listo', 'recogido', 'en_transito', 'entregado', 'confirmado', 'observacion'];
const CONDITIONS = ['sin_verificar', 'sin_novedad', 'requiere_revision', 'no_conforme'];
const SEVERITIES = ['baja', 'media', 'alta'];
const CLOSED_INCIDENT = ['resuelta', 'cerrada'];

async function auditDetails(client, table, ids, actions) {
  const details = new Map();
  if (!ids.length) return details;
  const rows = (await client.query(`SELECT a.id_registro, a.accion, a.id_usuario, a.descripcion, a.fecha, u.nombres, u.apellidos
    FROM auditoria a LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
    WHERE a.tabla_afectada = ? AND a.id_registro IN (${placeholders(ids)}) AND a.accion IN (${placeholders(actions)})
    ORDER BY a.id_auditoria`, [table, ...ids, ...actions])).rows;
  for (const row of rows) details.set(`${row.id_registro}:${row.accion}`, { ...parseDetail(row.descripcion), actor: row.id_usuario, actor_nombre: fullName(row) || null, fecha: row.fecha });
  return details;
}

// Hitos, incidencias, etapa actual y versión (para concurrencia optimista) de cada donación.
async function custodyContext(client, donationIds) {
  const ids = [...new Set(donationIds)];
  const context = new Map(ids.map(donationId => [donationId, { hitos: [], incidencias: [] }]));
  if (!ids.length) return context;
  const events = (await client.query(`SELECT g.*, u.nombres, u.apellidos, u.rol, u.correo FROM seguimientos g LEFT JOIN usuarios u ON u.id_usuario = g.id_usuario
    WHERE g.id_donacion IN (${placeholders(ids)}) AND g.etapa IN (${placeholders(CUSTODY_STAGES)}) ORDER BY g.id_donacion, g.id_seguimiento`, [...ids, ...CUSTODY_STAGES])).rows;
  const incidents = (await client.query(`SELECT i.*, u.nombres, u.apellidos FROM incidencias i LEFT JOIN usuarios u ON u.id_usuario = i.id_usuario
    WHERE i.id_donacion IN (${placeholders(ids)}) ORDER BY i.id_incidencia`, ids)).rows;
  const eventDetails = await auditDetails(client, 'seguimientos', events.map(e => e.id_seguimiento), ['registrar_hito']);
  const incidentDetails = await auditDetails(client, 'incidencias', incidents.map(i => i.id_incidencia), ['reportar', 'resolver']);
  for (const event of events) {
    const c = context.get(event.id_donacion);
    const detail = eventDetails.get(`${event.id_seguimiento}:registrar_hito`) || {};
    const repeated = c.hitos.some(h => h.etapa === event.etapa);
    c.hitos.push({
      id_hito: event.id_seguimiento, etapa: event.etapa, estado_resultante: STATE_OF_STAGE[event.etapa],
      tipo: EVENT_TYPES.includes(detail.tipo) ? detail.tipo : repeated ? 'observacion' : TYPE_OF_STAGE[event.etapa],
      id_usuario: event.id_usuario, responsable: event.responsable || '',
      responsable_entrega: detail.responsable_entrega || '', responsable_recibe: detail.responsable_recibe || '',
      lugar: detail.lugar || '', condicion_declarada: CONDITIONS.includes(detail.condicion_declarada) ? detail.condicion_declarada : 'sin_verificar',
      temperatura_c: Number.isFinite(detail.temperatura_c) ? detail.temperatura_c : null,
      conserva_frio: typeof detail.conserva_frio === 'boolean' ? detail.conserva_frio : null,
      observacion: event.observaciones || '', fecha_evento: event.fecha_evento,
      es_demostracion: isDemoEmail(event.correo), actor_nombre: fullName(event) || 'Usuario no disponible', actor_rol: event.rol || ''
    });
  }
  for (const incident of incidents) {
    const report = incidentDetails.get(`${incident.id_incidencia}:reportar`) || {};
    const resolution = incidentDetails.get(`${incident.id_incidencia}:resolver`);
    const closed = CLOSED_INCIDENT.includes(incident.estado);
    context.get(incident.id_donacion).incidencias.push({
      id_incidencia: incident.id_incidencia, id_seguimiento: null, id_donacion: incident.id_donacion, id_solicitud: incident.id_solicitud,
      id_usuario: incident.id_usuario, tipo: incident.tipo, severidad: SEVERITIES.includes(report.severidad) ? report.severidad : 'media',
      titulo: report.titulo || incident.tipo, descripcion: incident.descripcion,
      estado: closed ? 'resuelta' : 'abierta', estado_registro: incident.estado,
      fecha_creacion: incident.fecha_registro, fecha_registro: incident.fecha_registro, fecha_resolucion: incident.fecha_resolucion,
      resolucion: resolution?.resolucion || null, id_usuario_resuelve: resolution?.actor ?? null, resuelto_por: resolution?.actor_nombre || null,
      actor_nombre: fullName(incident) || 'Usuario no disponible'
    });
  }
  for (const c of context.values()) {
    const last = c.hitos.at(-1) || null;
    c.estado = last ? STATE_OF_STAGE[last.etapa] : 'preparacion';
    c.ultimo_hito = last;
    c.incidencias_abiertas = c.incidencias.filter(i => i.estado === 'abierta').length;
    c.incidencias_criticas = c.incidencias.filter(i => i.estado === 'abierta' && i.severidad === 'alta').length;
    // Cada hito, incidencia y resolución incrementa la versión, igual que el contador anterior.
    c.version = c.hitos.length + c.incidencias.length + c.incidencias.filter(i => i.estado === 'resuelta').length;
    const times = [...c.hitos.map(h => h.fecha_evento), ...c.incidencias.flatMap(i => [i.fecha_creacion, i.fecha_resolucion])].filter(Boolean).map(value => new Date(value).getTime());
    c.fecha_actualizacion = times.length ? new Date(Math.max(...times)) : null;
  }
  return context;
}

// Resumen para tarjetas de donación (equivale a la antigua columna calculada cadena_custodia).
export async function custodySummaries(donationIds, client = db) {
  const ids = [...new Set(donationIds)];
  if (!ids.length) return new Map();
  const deliveries = (await client.query(`SELECT e.id_entrega, e.id_donacion, s.fecha_recojo_propuesta, s.mensaje FROM entregas e
    JOIN solicitudes s ON s.id_solicitud = e.id_solicitud WHERE e.id_donacion IN (${placeholders(ids)})`, ids)).rows;
  if (!deliveries.length) return new Map();
  const context = await custodyContext(client, deliveries.map(e => e.id_donacion));
  return new Map(deliveries.map(e => {
    const c = context.get(e.id_donacion);
    return [e.id_donacion, { id_seguimiento: e.id_entrega, estado: c.estado, fecha_propuesta: e.fecha_recojo_propuesta, dispone_cadena_frio: coldChainDeclared(e.mensaje),
      condicion_declarada: c.ultimo_hito?.condicion_declarada || 'sin_verificar', incidencias_criticas: c.incidencias_criticas, incidencias_abiertas: c.incidencias_abiertas }];
  }));
}

export async function createTracking(client, requestId, actorId) {
  const row = (await client.query(`SELECT s.id_solicitud, s.estado, d.id_donacion, d.direccion_recojo, dt.nombre_establecimiento FROM solicitudes s
    JOIN donaciones d ON d.id_donacion = s.id_donacion JOIN donantes dt ON dt.id_donante = d.id_donante WHERE s.id_solicitud = ?`, [requestId])).rows[0];
  if (!row || row.estado !== 'aceptada') return null;
  const existing = (await client.query('SELECT id_entrega FROM entregas WHERE id_donacion = ?', [row.id_donacion])).rows[0];
  if (existing) return { id_entrega: existing.id_entrega, id_seguimiento: existing.id_entrega };
  const custodian = String(row.nombre_establecimiento).slice(0, 150);
  const delivery = await client.query("INSERT INTO entregas (id_donacion, id_solicitud, responsable_entrega, estado) VALUES (?, ?, ?, 'pendiente')", [row.id_donacion, row.id_solicitud, custodian]);
  const event = await client.query("INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, 'solicitud_aceptada', ?, ?)",
    [row.id_donacion, actorId, custodian, 'Solicitud aceptada. El alimento continúa bajo custodia del donante hasta registrar la transferencia.']);
  await audit(client, actorId, 'seguimientos', event.insertId, 'registrar_hito', { id_entrega: delivery.insertId, tipo: 'aceptacion', estado: 'preparacion', lugar: row.direccion_recojo, condicion_declarada: 'sin_verificar' });
  await audit(client, actorId, 'entregas', delivery.insertId, 'iniciar', { id_solicitud: row.id_solicitud });
  return { id_entrega: delivery.insertId, id_seguimiento: delivery.insertId };
}

const TRACKING_SELECT = `SELECT e.*, s.*, d.*, dt.*, o.* FROM entregas e
  JOIN solicitudes s ON s.id_solicitud = e.id_solicitud JOIN donaciones d ON d.id_donacion = e.id_donacion
  JOIN donantes dt ON dt.id_donante = d.id_donante JOIN organizaciones o ON o.id_organizacion = s.id_organizacion`;
function trackingFromRow({ e, s, d, dt, o }, c, evaluation) {
  const donacion = donationFromRow(d, dt);
  for (const incident of c.incidencias) incident.id_seguimiento = e.id_entrega;
  return {
    id_seguimiento: e.id_entrega, id_entrega: e.id_entrega, id_solicitud: s.id_solicitud, id_donacion: d.id_donacion,
    id_organizacion: s.id_organizacion, id_donante: d.id_donante, estado: c.estado, entrega_estado: e.estado,
    custodio_actual: e.responsable_recepcion || e.responsable_entrega || dt.nombre_establecimiento,
    responsable_entrega: e.responsable_entrega, responsable_recepcion: e.responsable_recepcion,
    fecha_recojo: e.fecha_recojo, fecha_entrega: e.fecha_entrega, fecha_confirmacion: e.fecha_confirmacion,
    origen: { nombre: dt.nombre_establecimiento, direccion: d.direccion_recojo || '', distrito: dt.distrito || '', latitud: d.latitud, longitud: d.longitud },
    destino: { nombre: o.nombre, direccion: splitAddress(o.direccion).direccion, distrito: o.distrito || '', latitud: o.latitud, longitud: o.longitud },
    version: c.version, fecha_inicio: c.hitos[0]?.fecha_evento || null, fecha_actualizacion: c.fecha_actualizacion,
    solicitud_estado: s.estado, fecha_propuesta: s.fecha_recojo_propuesta, dispone_cadena_frio: coldChainDeclared(s.mensaje),
    responsable_recojo: s.responsable_recojo || '', transporte_declarado: s.tipo_transporte || '',
    alimento: donacion.alimento, categoria: donacion.categoria, cantidad: donacion.cantidad, unidad: donacion.unidad,
    imagen_clave: '', perfil_alimento: donacion.perfil_alimento, donacion_estado: d.estado,
    fecha_limite_aprovechamiento_declarada: donacion.fecha_limite_aprovechamiento_declarada, requiere_cadena_frio: donacion.requiere_cadena_frio,
    conservacion_declarada: donacion.conservacion_declarada, temperatura_declarada: donacion.temperatura_declarada, envase: donacion.envase,
    donacion, fotos: [], incidencias_abiertas: c.incidencias_abiertas, incidencias_criticas: c.incidencias_criticas,
    ultimo_hito: c.ultimo_hito, ultima_evaluacion: evaluationFromRow(evaluation),
    hitos: c.hitos, incidencias: [...c.incidencias].reverse()
  };
}
async function loadTrackings(where, params, client = db) {
  const rows = (await client.query(`${TRACKING_SELECT} ${where}`, params, { nestTables: true })).rows;
  if (!rows.length) return [];
  const context = await custodyContext(client, rows.map(row => row.e.id_donacion));
  const requestIds = rows.map(row => row.s.id_solicitud);
  const evaluations = (await client.query(`SELECT ev.* FROM evaluaciones_ruta ev JOIN (SELECT MAX(id_evaluacion) AS id_evaluacion FROM evaluaciones_ruta
    WHERE id_solicitud IN (${placeholders(requestIds)}) GROUP BY id_solicitud) ultima ON ultima.id_evaluacion = ev.id_evaluacion`, requestIds)).rows;
  await attachEvaluationDetails(evaluations, client);
  const byRequest = new Map(evaluations.map(ev => [ev.id_solicitud, ev]));
  const list = rows.map(row => trackingFromRow(row, context.get(row.e.id_donacion), byRequest.get(row.s.id_solicitud)));
  await attachPhotos(list.map(t => t.donacion), client);
  for (const t of list) t.fotos = t.donacion.fotos;
  return list;
}
const summary = ({ hitos, incidencias, ...tracking }) => tracking;

function access(user, tracking) {
  if (user.rol === 'administrador') return;
  if (user.rol === 'donante' && user.perfil?.id_donante === tracking.id_donante) return;
  if (user.rol === 'organizacion' && user.perfil?.id_organizacion === tracking.id_organizacion) return;
  fail(403, 'TRACKING_FORBIDDEN', 'Solo los participantes y administración pueden consultar esta cadena de custodia.');
}
// Mismo orden de bloqueo que el resto de operaciones: primero la donación y luego su entrega.
async function lockDelivery(client, donationId) {
  await client.query('SELECT id_donacion FROM donaciones WHERE id_donacion = ? FOR UPDATE', [donationId]);
  await client.query('SELECT id_entrega FROM entregas WHERE id_donacion = ? FOR UPDATE', [donationId]);
}
async function trackingFor(user, trackingId, client = db, lock = false) {
  if (lock) {
    const ref = (await client.query('SELECT id_donacion FROM entregas WHERE id_entrega = ?', [trackingId])).rows[0];
    if (ref) await lockDelivery(client, ref.id_donacion);
  }
  const [t] = await loadTrackings('WHERE e.id_entrega = ?', [trackingId], client);
  if (!t) fail(404, 'TRACKING_NOT_FOUND', 'No se encontró el seguimiento.');
  access(user, t);
  return t;
}
function scope(user) {
  if (user.rol === 'administrador') return { sql: '1 = 1', params: [] };
  return user.rol === 'donante'
    ? { sql: 'd.id_donante = ?', params: [user.perfil?.id_donante || -1] }
    : { sql: 's.id_organizacion = ?', params: [user.perfil?.id_organizacion || -1] };
}

export function trackingInputs(t, input = {}) {
  const progress = ['recogido', 'en_transito', 'entregado', 'confirmado'].includes(t.estado);
  return { ...input, fecha_propuesta: progress ? null : t.fecha_propuesta,
    dispone_cadena_frio: typeof input.dispone_cadena_frio === 'boolean' ? input.dispone_cadena_frio : (t.ultimo_hito?.conserva_frio ?? t.dispone_cadena_frio),
    etapa_custodia: t.estado, condicion_declarada: t.ultimo_hito?.condicion_declarada || 'sin_verificar',
    incidencias_criticas: t.incidencias_criticas, incidencias_abiertas: t.incidencias_abiertas };
}
export async function evaluateTracking(t, user, input = {}, client = db) {
  const moved = ['recogido', 'en_transito', 'entregado', 'confirmado'].includes(t.estado);
  const journey = await calculateJourney(t.origen, t.destino, { pickup: !moved });
  const effective = trackingInputs(t, { ...(t.ultima_evaluacion?.planificacion || {}), ...input, viaje_recojo_min: journey.ruta_recojo?.duracion_estimada_min || 0 });
  const evaluation = evaluateLogistics(t.donacion, journey.ruta, effective);
  await saveEvaluation(client, { donationId: t.id_donacion, organizationId: t.id_organizacion, requestId: t.id_solicitud, origin: t.origen, destination: t.destino, route: journey.ruta, pickupRoute: journey.ruta_recojo, evaluation, actorId: user.id_usuario, input: effective });
  return { ...journey, evaluacion: evaluation };
}

export const custodyRouter = Router();
custodyRouter.use(requireAuth);
custodyRouter.get('/seguimiento', async (req, res) => {
  const filter = scope(req.user);
  const list = await loadTrackings(`WHERE ${filter.sql}`, filter.params);
  list.sort((a, b) => (a.estado === 'confirmado') - (b.estado === 'confirmado') || new Date(b.fecha_actualizacion) - new Date(a.fecha_actualizacion));
  res.json({ data: list.slice(0, 200).map(summary) });
});
custodyRouter.get('/seguimiento/:id', async (req, res) => {
  const t = await trackingFor(req.user, id(req.params.id));
  // Solo se entrega un plan si la geometría sigue en caché; si no, la interfaz recalcula la ruta.
  if (t.ultima_evaluacion?.distancia_km != null && evaluationMatches(t.ultima_evaluacion, t.origen, t.destino)) {
    const route = routeFromEvaluation(t.ultima_evaluacion);
    const pickupRoute = pickupFromEvaluation(t.ultima_evaluacion);
    const moved = ['recogido', 'en_transito', 'entregado', 'confirmado'].includes(t.estado);
    if (route.geometry && t.ultima_evaluacion.planificacion && (moved || pickupRoute?.geometry)) {
      const input = trackingInputs(t, { ...t.ultima_evaluacion.planificacion, viaje_recojo_min: moved ? 0 : pickupRoute.duracion_estimada_min });
      t.plan_actual = { ruta: route, ruta_recojo: moved ? null : pickupRoute, evaluacion: evaluateLogistics(t.donacion, route, input) };
    }
  }
  res.json({ data: t });
});
custodyRouter.post('/seguimiento/:id/evaluacion', async (req, res) => {
  const t = await trackingFor(req.user, id(req.params.id));
  res.json({ data: await evaluateTracking(t, req.user, req.body) });
});

const allowedRoles = { listo: ['donante', 'administrador'], recogido: ['donante', 'organizacion', 'administrador'], en_transito: ['organizacion', 'administrador'], entregado: ['organizacion', 'administrador'], confirmado: ['organizacion', 'administrador'], observacion: ['donante', 'organizacion', 'administrador'] };
function milestoneInput(user, body) {
  const type = text(body.tipo, 'tipo de hito', 3, 30);
  if (!allowedRoles[type]?.includes(user.rol)) fail(403, 'CUSTODY_ROLE', 'Su rol no puede registrar este hito de custodia.');
  const value = { responsable_entrega: optionalText(body.responsable_entrega, 'responsable de entrega', 150), responsable_recibe: optionalText(body.responsable_recibe, 'responsable que recibe', 150),
    lugar: text(body.lugar, 'lugar del hito', 3, 300), condicion_declarada: text(body.condicion_declarada, 'condición declarada', 3, 40), observacion: text(body.observacion, 'observación', 5, 2500),
    temperatura_c: body.temperatura_c == null || body.temperatura_c === '' ? null : Math.round(number(body.temperatura_c, 'temperatura medida declarada', -80, 120) * 100) / 100,
    conserva_frio: body.conserva_frio == null ? null : bool(body.conserva_frio, 'conserva_frio') };
  if (!CONDITIONS.includes(value.condicion_declarada)) fail(422, 'CUSTODY_CONDITION', 'Seleccione una condición válida.');
  const transfer = ['recogido', 'entregado', 'confirmado'].includes(type);
  if (transfer && (!value.responsable_entrega || !value.responsable_recibe)) fail(422, 'CUSTODY_PEOPLE', 'Identifique a quien entrega y a quien recibe en la transferencia.');
  return { type, value, transfer };
}
export const getTracking = (user, trackingId, client = db) => trackingFor(user, trackingId, client);
// Registra un hito dentro de la transacción recibida; la usan la API y los escenarios de demostración.
export async function registerMilestone(client, user, trackingId, body) {
  const { type, value, transfer } = milestoneInput(user, body);
  const t = await trackingFor(user, trackingId, client, true);
  if (number(body.version, 'versión', 1, 2147483647) !== t.version) fail(409, 'CUSTODY_CONFLICT', 'Otro usuario actualizó el seguimiento. Recargue antes de registrar el hito.');
  if (t.solicitud_estado !== 'aceptada' || t.donacion_estado === 'cancelada') fail(409, 'CUSTODY_CANCELED', 'La operación fue cancelada y no admite nuevos hitos.');
  if (t.estado === 'confirmado') fail(409, 'CUSTODY_CLOSED', 'La recepción ya fue confirmada. Puede registrar una incidencia posterior.');
  if (type !== 'observacion' && TRANSITIONS[t.estado] !== type) fail(409, 'CUSTODY_SEQUENCE', 'Los hitos deben registrarse en orden, sin saltar etapas.');
  if (type === 'confirmado' && (t.incidencias_criticas > 0 || value.condicion_declarada !== 'sin_novedad')) fail(409, 'CUSTODY_REVIEW', 'Resuelva las incidencias críticas y registre la revisión antes de confirmar. La entrega puede mantenerse registrada para revisión.');
  const next = type === 'observacion' ? t.estado : type;
  const custodian = transfer ? value.responsable_recibe : t.custodio_actual;
  const event = await client.query('INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, ?, ?, ?)',
    [t.id_donacion, user.id_usuario, type === 'observacion' ? OBSERVATION_STAGE[t.estado] : EVENT_STAGE[type], String(custodian || '').slice(0, 150) || null, value.observacion]);
  await audit(client, user.id_usuario, 'seguimientos', event.insertId, 'registrar_hito', { id_entrega: t.id_entrega, tipo: type, estado: next, lugar: value.lugar,
    condicion_declarada: value.condicion_declarada, temperatura_c: value.temperatura_c, conserva_frio: value.conserva_frio,
    responsable_entrega: value.responsable_entrega, responsable_recibe: value.responsable_recibe });
  if (type !== 'observacion') {
    const sets = ['estado = ?'], values = [DELIVERY_STATE[next]];
    if (transfer) { sets.push('responsable_entrega = ?', 'responsable_recepcion = ?'); values.push(value.responsable_entrega, value.responsable_recibe); }
    if (type === 'recogido') sets.push('fecha_recojo = NOW()');
    if (type === 'entregado') sets.push('fecha_entrega = NOW()');
    if (type === 'confirmado') sets.push('fecha_confirmacion = NOW()');
    await client.query(`UPDATE entregas SET ${sets.join(', ')} WHERE id_entrega = ?`, [...values, t.id_entrega]);
  }
  if (type === 'confirmado') {
    await client.query("UPDATE donaciones SET estado = 'finalizada', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_donacion = ? AND estado = 'en_proceso'", [t.id_donacion]);
    await audit(client, user.id_usuario, 'donaciones', t.id_donacion, 'finalizar', { id_entrega: t.id_entrega });
  }
  if (value.condicion_declarada === 'no_conforme') {
    const incident = await client.query("INSERT INTO incidencias (id_donacion, id_solicitud, id_usuario, tipo, descripcion) VALUES (?, ?, ?, 'calidad', ?)", [t.id_donacion, t.id_solicitud, user.id_usuario, value.observacion]);
    await audit(client, user.id_usuario, 'incidencias', incident.insertId, 'reportar', { id_entrega: t.id_entrega, tipo: 'calidad', severidad: 'alta', titulo: 'Condición no conforme declarada en custodia', automatica: true });
  }
  const hito = (await custodyContext(client, [t.id_donacion])).get(t.id_donacion).hitos.find(h => h.id_hito === event.insertId);
  return { ...hito, id_seguimiento: t.id_entrega };
}
custodyRouter.post('/seguimiento/:id/hitos', async (req, res) => {
  milestoneInput(req.user, req.body);
  const trackingId = id(req.params.id);
  res.status(201).json({ data: await transaction(client => registerMilestone(client, req.user, trackingId, req.body)) });
});

async function incidentById(client, incidentId) {
  const ref = (await client.query('SELECT i.id_donacion, e.id_entrega FROM incidencias i LEFT JOIN entregas e ON e.id_donacion = i.id_donacion WHERE i.id_incidencia = ?', [incidentId])).rows[0];
  if (!ref) return null;
  const incident = (await custodyContext(client, [ref.id_donacion])).get(ref.id_donacion).incidencias.find(i => i.id_incidencia === incidentId);
  return { ...incident, id_seguimiento: ref.id_entrega };
}
custodyRouter.get('/incidencias', async (req, res) => {
  const filter = scope(req.user);
  const list = (await loadTrackings(`WHERE ${filter.sql}`, filter.params)).flatMap(t => t.incidencias.map(i => ({
    ...i, alimento: t.alimento, id_solicitud: i.id_solicitud ?? t.id_solicitud, origen: t.origen, destino: t.destino })));
  list.sort((a, b) => (a.estado === 'abierta' ? 0 : 1) - (b.estado === 'abierta' ? 0 : 1) || new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
  res.json({ data: list.slice(0, 200) });
});
function incidentInput(body) {
  const type = text(body.tipo, 'tipo', 3, 40), severity = text(body.severidad, 'severidad', 3, 20);
  if (!['demora', 'temperatura', 'envase', 'calidad', 'otro'].includes(type) || !SEVERITIES.includes(severity)) fail(422, 'INCIDENT_INVALID', 'Seleccione tipo y severidad válidos.');
  return { type, severity, title: text(body.titulo, 'título', 5, 180), description: text(body.descripcion, 'descripción', 10, 2500) };
}
export async function reportIncident(client, user, trackingId, body) {
  const { type, severity, title, description } = incidentInput(body);
  const t = await trackingFor(user, trackingId, client, true);
  const created = await client.query('INSERT INTO incidencias (id_donacion, id_solicitud, id_usuario, tipo, descripcion) VALUES (?, ?, ?, ?, ?)', [t.id_donacion, t.id_solicitud, user.id_usuario, type, description]);
  await audit(client, user.id_usuario, 'incidencias', created.insertId, 'reportar', { id_entrega: t.id_entrega, tipo: type, severidad: severity, titulo: title });
  return incidentById(client, created.insertId);
}
custodyRouter.post('/seguimiento/:id/incidencias', async (req, res) => {
  incidentInput(req.body);
  const trackingId = id(req.params.id);
  res.status(201).json({ data: await transaction(client => reportIncident(client, req.user, trackingId, req.body)) });
});
custodyRouter.post('/incidencias/:id/resolver', requireRole('administrador'), async (req, res) => {
  const resolution = text(req.body.resolucion, 'resolución', 10, 2500);
  const incidentId = id(req.params.id);
  const result = await transaction(async client => {
    const ref = (await client.query('SELECT id_donacion FROM incidencias WHERE id_incidencia = ?', [incidentId])).rows[0];
    if (!ref) fail(404, 'INCIDENT_NOT_FOUND', 'No se encontró la incidencia.');
    await lockDelivery(client, ref.id_donacion);
    const incident = (await client.query('SELECT * FROM incidencias WHERE id_incidencia = ? FOR UPDATE', [incidentId])).rows[0];
    if (CLOSED_INCIDENT.includes(incident.estado)) fail(409, 'INCIDENT_CLOSED', 'La incidencia ya fue resuelta.');
    await client.query("UPDATE incidencias SET estado = 'resuelta', fecha_resolucion = NOW() WHERE id_incidencia = ?", [incidentId]);
    await audit(client, req.user.id_usuario, 'incidencias', incidentId, 'resolver', { resolucion: resolution });
    return incidentById(client, incidentId);
  });
  res.json({ data: result });
});
