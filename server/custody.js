import { Router } from 'express';
import { db, transaction, audit, placeholders } from './db.js';
import { requireAuth, requireRole, isDemoEmail, fullName } from './auth.js';
import { fail } from './errors.js';
import { id, text, optionalText, number, bool } from './validation.js';
import { attachPhotos } from './photos.js';
import { donationFromRow, splitAddress, coldChainDeclared, parseDetail } from './mappers.js';
import { notify } from './notifications.js';

// Modelo MySQL del recojo:
//  - entregas: una fila por donación asignada, con su estado y los responsables actuales.
//  - seguimientos: hitos de la donación (la aplicación solo inserta; nunca reescribe ni borra).
//  - incidencias: problemas reportados durante el recojo o la recepción.
// Lugar, condición, temperatura, severidad, título y resolución no tienen columna propia: se guardan
// en auditoria.descripcion dentro de la misma transacción y se leen desde allí.
//
// Etapas: preparación (al aceptar) → listo (donante) → recogido → recibido. La recepción puede cerrarse
// "con problemas". Antes del recojo, cualquiera de las dos partes puede anular el recojo: la donación
// vuelve a publicarse si su plazo sigue vigente.
const TRANSITIONS = { preparacion: 'listo', listo: 'recogido', recogido: 'confirmado' };
const CLOSING = ['confirmado', 'con_problemas'];
const EVENT_STAGE = { aceptacion: 'solicitud_aceptada', listo: 'lista_recojo', recogido: 'en_recojo', confirmado: 'recepcion_confirmada', con_problemas: 'recepcion_confirmada' };
const OBSERVATION_STAGE = { preparacion: 'preparando', listo: 'lista_recojo', recogido: 'en_recojo', confirmado: 'recepcion_confirmada', con_problemas: 'recepcion_confirmada' };
// Las etapas en_traslado y entregada vienen de la versión anterior (seis etapas): cuentan como recogido.
const STATE_OF_STAGE = { solicitud_aceptada: 'preparacion', preparando: 'preparacion', lista_recojo: 'listo', en_recojo: 'recogido', en_traslado: 'recogido', entregada: 'recogido', recepcion_confirmada: 'confirmado', finalizada: 'confirmado' };
const TYPE_OF_STAGE = { solicitud_aceptada: 'aceptacion', preparando: 'observacion', lista_recojo: 'listo', en_recojo: 'recogido', en_traslado: 'en_transito', entregada: 'entregado', recepcion_confirmada: 'confirmado', finalizada: 'confirmado' };
const DELIVERY_STATE = { preparacion: 'pendiente', listo: 'pendiente', recogido: 'en_recojo', confirmado: 'confirmada', con_problemas: 'con_incidencia' };
const CUSTODY_STAGES = Object.keys(STATE_OF_STAGE);
const EVENT_TYPES = ['aceptacion', 'listo', 'recogido', 'en_transito', 'entregado', 'confirmado', 'con_problemas', 'observacion'];
const CONDITIONS = ['sin_verificar', 'sin_novedad', 'requiere_revision', 'no_conforme'];
const SEVERITIES = ['baja', 'media', 'alta'];
const CLOSED_INCIDENT = ['resuelta', 'cerrada'];
const BEFORE_PICKUP = ['preparacion', 'listo'];

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

function incidentFromRow(incident, details) {
  const report = details.get(`${incident.id_incidencia}:reportar`) || {};
  const resolution = details.get(`${incident.id_incidencia}:resolver`);
  return {
    id_incidencia: incident.id_incidencia, id_seguimiento: incident.id_entrega ?? null, id_donacion: incident.id_donacion, id_solicitud: incident.id_solicitud,
    id_usuario: incident.id_usuario, tipo: incident.tipo, severidad: SEVERITIES.includes(report.severidad) ? report.severidad : 'media',
    titulo: report.titulo || incident.tipo, descripcion: incident.descripcion,
    estado: CLOSED_INCIDENT.includes(incident.estado) ? 'resuelta' : 'abierta', estado_registro: incident.estado,
    fecha_creacion: incident.fecha_registro, fecha_registro: incident.fecha_registro, fecha_resolucion: incident.fecha_resolucion,
    resolucion: resolution?.resolucion || null, id_usuario_resuelve: resolution?.actor ?? null, resuelto_por: resolution?.actor_nombre || null,
    actor_nombre: fullName(incident) || 'Usuario no disponible'
  };
}

// Hitos, incidencias, etapa actual y versión (para concurrencia optimista) de cada entrega.
// Si una donación volvió a publicarse, solo cuentan los hitos posteriores a esa nueva publicación.
async function custodyContext(client, deliveries) {
  const context = new Map(deliveries.map(e => [e.id_donacion, { hitos: [], incidencias: [] }]));
  if (!deliveries.length) return context;
  const ids = [...context.keys()];
  const events = (await client.query(`SELECT g.*, u.nombres, u.apellidos, u.rol, u.correo FROM seguimientos g LEFT JOIN usuarios u ON u.id_usuario = g.id_usuario
    WHERE g.id_donacion IN (${placeholders(ids)}) AND g.etapa IN (${placeholders(CUSTODY_STAGES)})
      AND g.id_seguimiento > (SELECT COALESCE(MAX(p.id_seguimiento), 0) FROM seguimientos p WHERE p.id_donacion = g.id_donacion AND p.etapa = 'publicada')
    ORDER BY g.id_donacion, g.id_seguimiento`, [...ids, ...CUSTODY_STAGES])).rows;
  const requestIds = deliveries.map(e => e.id_solicitud);
  const incidents = (await client.query(`SELECT i.*, u.nombres, u.apellidos FROM incidencias i LEFT JOIN usuarios u ON u.id_usuario = i.id_usuario
    WHERE i.id_solicitud IN (${placeholders(requestIds)}) ORDER BY i.id_incidencia`, requestIds)).rows;
  const eventDetails = await auditDetails(client, 'seguimientos', events.map(e => e.id_seguimiento), ['registrar_hito']);
  const incidentDetails = await auditDetails(client, 'incidencias', incidents.map(i => i.id_incidencia), ['reportar', 'resolver']);
  for (const event of events) {
    const c = context.get(event.id_donacion);
    const detail = eventDetails.get(`${event.id_seguimiento}:registrar_hito`) || {};
    const repeated = c.hitos.some(h => h.etapa === event.etapa);
    const tipo = EVENT_TYPES.includes(detail.tipo) ? detail.tipo : repeated ? 'observacion' : TYPE_OF_STAGE[event.etapa];
    c.hitos.push({
      id_hito: event.id_seguimiento, etapa: event.etapa, tipo,
      estado_resultante: tipo === 'con_problemas' ? 'con_problemas' : STATE_OF_STAGE[event.etapa],
      id_usuario: event.id_usuario, responsable: event.responsable || '',
      responsable_entrega: detail.responsable_entrega || '', responsable_recibe: detail.responsable_recibe || '',
      lugar: detail.lugar || '', condicion_declarada: CONDITIONS.includes(detail.condicion_declarada) ? detail.condicion_declarada : 'sin_verificar',
      temperatura_c: Number.isFinite(detail.temperatura_c) ? detail.temperatura_c : null,
      conserva_frio: typeof detail.conserva_frio === 'boolean' ? detail.conserva_frio : null,
      observacion: event.observaciones || '', fecha_evento: event.fecha_evento,
      es_demostracion: isDemoEmail(event.correo), actor_nombre: fullName(event) || 'Usuario no disponible', actor_rol: event.rol || ''
    });
  }
  const byRequest = new Map(deliveries.map(e => [e.id_solicitud, e]));
  for (const incident of incidents) {
    const delivery = byRequest.get(incident.id_solicitud);
    context.get(delivery.id_donacion).incidencias.push(incidentFromRow({ ...incident, id_entrega: delivery.id_entrega }, incidentDetails));
  }
  for (const c of context.values()) {
    // La etapa la marca el último hito que no es una observación.
    const last = c.hitos.at(-1) || null;
    const stage = [...c.hitos].reverse().find(h => h.tipo !== 'observacion');
    c.estado = stage ? stage.estado_resultante : 'preparacion';
    c.ultimo_hito = last;
    c.incidencias_abiertas = c.incidencias.filter(i => i.estado === 'abierta').length;
    c.incidencias_criticas = c.incidencias.filter(i => i.estado === 'abierta' && i.severidad === 'alta').length;
    // Cada hito, incidencia y resolución incrementa la versión.
    c.version = c.hitos.length + c.incidencias.length + c.incidencias.filter(i => i.estado === 'resuelta').length;
    const times = [...c.hitos.map(h => h.fecha_evento), ...c.incidencias.flatMap(i => [i.fecha_creacion, i.fecha_resolucion])].filter(Boolean).map(value => new Date(value).getTime());
    c.fecha_actualizacion = times.length ? new Date(Math.max(...times)) : null;
  }
  return context;
}

// Resumen para tarjetas de donación.
export async function custodySummaries(donationIds, client = db) {
  const ids = [...new Set(donationIds)];
  if (!ids.length) return new Map();
  const deliveries = (await client.query(`SELECT e.id_entrega, e.id_donacion, e.id_solicitud, s.fecha_recojo_propuesta, s.mensaje FROM entregas e
    JOIN solicitudes s ON s.id_solicitud = e.id_solicitud WHERE e.id_donacion IN (${placeholders(ids)})`, ids)).rows;
  if (!deliveries.length) return new Map();
  const context = await custodyContext(client, deliveries);
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
    [row.id_donacion, actorId, custodian, 'Solicitud aceptada. El alimento sigue con el donante hasta que lo recojan.']);
  await audit(client, actorId, 'seguimientos', event.insertId, 'registrar_hito', { id_entrega: delivery.insertId, tipo: 'aceptacion', estado: 'preparacion', lugar: row.direccion_recojo, condicion_declarada: 'sin_verificar' });
  await audit(client, actorId, 'entregas', delivery.insertId, 'iniciar', { id_solicitud: row.id_solicitud });
  return { id_entrega: delivery.insertId, id_seguimiento: delivery.insertId };
}

const TRACKING_SELECT = `SELECT e.*, s.*, d.*, dt.*, o.*, ud.telefono AS donante_telefono, ud.id_usuario AS donante_usuario, uo.id_usuario AS organizacion_usuario FROM entregas e
  JOIN solicitudes s ON s.id_solicitud = e.id_solicitud JOIN donaciones d ON d.id_donacion = e.id_donacion
  JOIN donantes dt ON dt.id_donante = d.id_donante JOIN usuarios ud ON ud.id_usuario = dt.id_usuario
  JOIN organizaciones o ON o.id_organizacion = s.id_organizacion JOIN usuarios uo ON uo.id_usuario = o.id_usuario`;
// Con nestTables, las columnas con alias siguen bajo su tabla (ud, uo).
function trackingFromRow({ e, s, d, dt, o, ud, uo }, c) {
  const donacion = donationFromRow(d, dt);
  return {
    id_seguimiento: e.id_entrega, id_entrega: e.id_entrega, id_solicitud: s.id_solicitud, id_donacion: d.id_donacion,
    id_organizacion: s.id_organizacion, id_donante: d.id_donante, estado: c.estado, entrega_estado: e.estado,
    usuario_donante: ud.donante_usuario, usuario_organizacion: uo.organizacion_usuario,
    custodio_actual: e.responsable_recepcion || e.responsable_entrega || dt.nombre_establecimiento,
    responsable_entrega: e.responsable_entrega, responsable_recepcion: e.responsable_recepcion,
    fecha_recojo: e.fecha_recojo, fecha_entrega: e.fecha_entrega, fecha_confirmacion: e.fecha_confirmacion,
    // Contacto para coordinar el recojo: cada parte ve el teléfono de la otra solo dentro de este seguimiento.
    origen: { nombre: dt.nombre_establecimiento, direccion: d.direccion_recojo || '', distrito: donacion.distrito || '', latitud: d.latitud, longitud: d.longitud, responsable: dt.responsable || '', telefono: ud.donante_telefono || '' },
    destino: { nombre: o.nombre, direccion: splitAddress(o.direccion).direccion, distrito: o.distrito || '', latitud: o.latitud, longitud: o.longitud, responsable: s.responsable_recojo || '', telefono: s.telefono_recojo || '' },
    version: c.version, fecha_inicio: c.hitos[0]?.fecha_evento || null, fecha_actualizacion: c.fecha_actualizacion,
    solicitud_estado: s.estado, fecha_propuesta: s.fecha_recojo_propuesta, tiempo_llegada_min: s.tiempo_llegada_min ?? null, dispone_cadena_frio: coldChainDeclared(s.mensaje),
    responsable_recojo: s.responsable_recojo || '', transporte_declarado: s.tipo_transporte || '',
    alimento: donacion.alimento, categoria: donacion.categoria, cantidad: donacion.cantidad, unidad: donacion.unidad,
    imagen_clave: '', perfil_alimento: donacion.perfil_alimento, donacion_estado: d.estado,
    fecha_limite_recojo: donacion.fecha_limite_recojo,
    fecha_limite_aprovechamiento_declarada: donacion.fecha_limite_aprovechamiento_declarada, requiere_cadena_frio: donacion.requiere_cadena_frio,
    conservacion_declarada: donacion.conservacion_declarada, temperatura_declarada: donacion.temperatura_declarada, envase: donacion.envase,
    donacion, fotos: [], incidencias_abiertas: c.incidencias_abiertas, incidencias_criticas: c.incidencias_criticas,
    ultimo_hito: c.ultimo_hito, hitos: c.hitos, incidencias: [...c.incidencias].reverse()
  };
}
async function loadTrackings(where, params, client = db) {
  const rows = (await client.query(`${TRACKING_SELECT} ${where}`, params, { nestTables: true })).rows;
  if (!rows.length) return [];
  const context = await custodyContext(client, rows.map(row => ({ id_donacion: row.e.id_donacion, id_solicitud: row.e.id_solicitud, id_entrega: row.e.id_entrega })));
  const list = rows.map(row => trackingFromRow(row, context.get(row.e.id_donacion)));
  await attachPhotos(list.map(t => t.donacion), client);
  for (const t of list) t.fotos = t.donacion.fotos;
  return list;
}
const summary = ({ hitos, incidencias, ...tracking }) => tracking;

function access(user, tracking) {
  if (user.rol === 'administrador') return;
  if (user.rol === 'donante' && user.perfil?.id_donante === tracking.id_donante) return;
  if (user.rol === 'organizacion' && user.perfil?.id_organizacion === tracking.id_organizacion) return;
  fail(403, 'TRACKING_FORBIDDEN', 'Solo los participantes y administración pueden consultar este seguimiento.');
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
  if (!t) fail(404, 'TRACKING_NOT_FOUND', 'No se encontró el seguimiento. Si se anuló el recojo, ya no aparece aquí.');
  access(user, t);
  return t;
}
function scope(user) {
  if (user.rol === 'administrador') return { sql: '1 = 1', params: [] };
  return user.rol === 'donante'
    ? { sql: 'd.id_donante = ?', params: [user.perfil?.id_donante || -1] }
    : { sql: 's.id_organizacion = ?', params: [user.perfil?.id_organizacion || -1] };
}
// La otra parte de un seguimiento (para avisarle); el administrador avisa a las dos.
const counterpart = (user, t) => user.rol === 'donante' ? [t.usuario_organizacion] : user.rol === 'organizacion' ? [t.usuario_donante] : [t.usuario_donante, t.usuario_organizacion];

export const custodyRouter = Router();
custodyRouter.use(requireAuth);
custodyRouter.get('/seguimiento', async (req, res) => {
  const filter = scope(req.user);
  const list = await loadTrackings(`WHERE ${filter.sql}`, filter.params);
  list.sort((a, b) => CLOSING.includes(a.estado) - CLOSING.includes(b.estado) || new Date(b.fecha_actualizacion) - new Date(a.fecha_actualizacion));
  res.json({ data: list.slice(0, 200).map(summary) });
});
custodyRouter.get('/seguimiento/:id', async (req, res) => {
  res.json({ data: await trackingFor(req.user, id(req.params.id)) });
});

const allowedRoles = { listo: ['donante', 'administrador'], recogido: ['donante', 'organizacion', 'administrador'], confirmado: ['organizacion', 'administrador'], con_problemas: ['organizacion', 'administrador'], observacion: ['donante', 'organizacion', 'administrador'] };
function milestoneInput(user, body) {
  const type = text(body.tipo, 'tipo de hito', 3, 30);
  if (!allowedRoles[type]?.includes(user.rol)) fail(403, 'CUSTODY_ROLE', 'Tu rol no puede registrar este paso del recojo.');
  const problems = type === 'con_problemas';
  const value = {
    responsable_entrega: optionalText(body.responsable_entrega, 'quién entrega', 150), responsable_recibe: optionalText(body.responsable_recibe, 'quién recibe', 150),
    lugar: optionalText(body.lugar, 'lugar', 300),
    condicion_declarada: body.condicion_declarada ? text(body.condicion_declarada, 'condición declarada', 3, 40) : problems ? 'requiere_revision' : type === 'confirmado' ? 'sin_novedad' : 'sin_verificar',
    // Recibir con problemas exige contar qué pasó; en los demás pasos la nota es opcional.
    observacion: problems ? text(body.observacion, 'qué problema hubo', 10, 2500) : optionalText(body.observacion, 'nota', 2500),
    temperatura_c: body.temperatura_c == null || body.temperatura_c === '' ? null : Math.round(number(body.temperatura_c, 'temperatura medida declarada', -80, 120) * 100) / 100,
    conserva_frio: body.conserva_frio == null || body.conserva_frio === '' ? null : bool(body.conserva_frio, 'conserva_frio')
  };
  if (!CONDITIONS.includes(value.condicion_declarada)) fail(422, 'CUSTODY_CONDITION', 'Selecciona una condición válida.');
  if (type === 'observacion' && value.observacion.length < 5) fail(422, 'VALIDATION_ERROR', 'Escribe la nota que quieres agregar (al menos 5 caracteres).');
  return { type, value };
}
export const getTracking = (user, trackingId, client = db) => trackingFor(user, trackingId, client);
const STEP_TEXT = { listo: 'El alimento está listo para recoger.', recogido: 'Se recogió el alimento.', confirmado: 'La beneficiaria recibió el alimento.', con_problemas: 'La beneficiaria recibió el alimento con problemas.' };
// Registra un paso dentro de la transacción recibida; la usan la API y los escenarios de demostración.
export async function registerMilestone(client, user, trackingId, body) {
  const { type, value } = milestoneInput(user, body);
  const t = await trackingFor(user, trackingId, client, true);
  if (number(body.version, 'versión', 1, 2147483647) !== t.version) fail(409, 'CUSTODY_CONFLICT', 'Otra persona actualizó este seguimiento. Recarga la página antes de continuar.');
  if (t.solicitud_estado !== 'aceptada' || t.donacion_estado === 'cancelada') fail(409, 'CUSTODY_CANCELED', 'La operación fue cancelada y no admite nuevos pasos.');
  if (CLOSING.includes(t.estado)) fail(409, 'CUSTODY_CLOSED', 'La recepción ya se registró. Si hay un problema, repórtalo como incidencia.');
  const expected = type === 'con_problemas' ? 'confirmado' : type;
  if (type !== 'observacion' && TRANSITIONS[t.estado] !== expected) fail(409, 'CUSTODY_SEQUENCE', 'Los pasos se registran en orden: listo, recogido y recibido.');
  if (type === 'confirmado' && t.incidencias_criticas > 0) fail(409, 'CUSTODY_REVIEW', 'Hay un problema grave sin resolver. Registra la recepción como "recibida con problemas" o espera a que administración lo resuelva.');
  const next = type === 'observacion' ? t.estado : type;
  // En el recojo el alimento pasa del donante a quien lo recoge; en la recepción, a la beneficiaria.
  if (type === 'recogido') { value.responsable_entrega ||= t.origen.nombre; value.responsable_recibe ||= t.responsable_recojo || t.destino.nombre; value.lugar ||= t.origen.direccion; }
  if (CLOSING.includes(type)) { value.responsable_entrega ||= t.custodio_actual; value.responsable_recibe ||= t.destino.nombre; value.lugar ||= t.destino.direccion; }
  if (type === 'listo') value.lugar ||= t.origen.direccion;
  const transfer = ['recogido', ...CLOSING].includes(type);
  const custodian = transfer ? value.responsable_recibe : t.custodio_actual;
  const event = await client.query('INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, ?, ?, ?)',
    [t.id_donacion, user.id_usuario, type === 'observacion' ? OBSERVATION_STAGE[t.estado] : EVENT_STAGE[type], String(custodian || '').slice(0, 150) || null, value.observacion || STEP_TEXT[type] || null]);
  await audit(client, user.id_usuario, 'seguimientos', event.insertId, 'registrar_hito', { id_entrega: t.id_entrega, tipo: type, estado: next, lugar: value.lugar,
    condicion_declarada: value.condicion_declarada, temperatura_c: value.temperatura_c, conserva_frio: value.conserva_frio,
    responsable_entrega: value.responsable_entrega, responsable_recibe: value.responsable_recibe });
  if (type !== 'observacion') {
    const sets = ['estado = ?'], values = [DELIVERY_STATE[next]];
    if (transfer) { sets.push('responsable_entrega = ?', 'responsable_recepcion = ?'); values.push(value.responsable_entrega, value.responsable_recibe); }
    if (type === 'recogido') sets.push('fecha_recojo = NOW()');
    if (CLOSING.includes(type)) sets.push('fecha_entrega = NOW()', 'fecha_confirmacion = NOW()');
    await client.query(`UPDATE entregas SET ${sets.join(', ')} WHERE id_entrega = ?`, [...values, t.id_entrega]);
  }
  if (CLOSING.includes(type)) {
    await client.query("UPDATE donaciones SET estado = 'finalizada', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_donacion = ? AND estado = 'en_proceso'", [t.id_donacion]);
    await audit(client, user.id_usuario, 'donaciones', t.id_donacion, 'finalizar', { id_entrega: t.id_entrega, con_problemas: type === 'con_problemas' });
  }
  // Un problema en la recepción o un alimento en mal estado quedan como incidencia para que administración lo revise.
  if (type === 'con_problemas' || value.condicion_declarada === 'no_conforme') {
    const problems = type === 'con_problemas';
    const incident = await client.query('INSERT INTO incidencias (id_donacion, id_solicitud, id_usuario, tipo, descripcion) VALUES (?, ?, ?, ?, ?)', [t.id_donacion, t.id_solicitud, user.id_usuario, problems ? 'recepcion' : 'calidad', value.observacion || 'Alimento declarado en mal estado.']);
    await audit(client, user.id_usuario, 'incidencias', incident.insertId, 'reportar', { id_entrega: t.id_entrega, tipo: problems ? 'recepcion' : 'calidad', severidad: problems ? 'media' : 'alta', titulo: problems ? 'Recibida con problemas' : 'Alimento declarado en mal estado', automatica: true });
  }
  const messages = {
    listo: ['Tu donación está lista para recoger', `${t.origen.nombre} marcó "${t.alimento}" como listo. Coordina el recojo.`],
    recogido: ['Se registró el recojo', `Se registró el recojo de "${t.alimento}".`],
    confirmado: ['La beneficiaria recibió tu donación', `${t.destino.nombre} confirmó que recibió "${t.alimento}". ¡Gracias por donar!`],
    con_problemas: ['Donación recibida con problemas', `${t.destino.nombre} recibió "${t.alimento}" con problemas: ${value.observacion}`]
  };
  if (messages[type]) await notify(client, counterpart(user, t), { titulo: messages[type][0], mensaje: messages[type][1], tipo: `seguimiento_${type}`, id_donacion: t.id_donacion, id_solicitud: t.id_solicitud });
  const hito = (await custodyContext(client, [{ id_donacion: t.id_donacion, id_solicitud: t.id_solicitud, id_entrega: t.id_entrega }])).get(t.id_donacion).hitos.find(h => h.id_hito === event.insertId);
  return { ...hito, id_seguimiento: t.id_entrega };
}
custodyRouter.post('/seguimiento/:id/hitos', async (req, res) => {
  milestoneInput(req.user, req.body);
  const trackingId = id(req.params.id);
  res.status(201).json({ data: await transaction(client => registerMilestone(client, req.user, trackingId, req.body)) });
});

// Anular el recojo antes de que se recoja: el donante registra que no vinieron, la beneficiaria que ya no
// podrá ir, o administración lo anula. La solicitud queda cancelada y la donación vuelve a publicarse si su
// plazo sigue vigente (si no, vence). Las demás beneficiarias que la habían pedido reciben un aviso.
const RELEASE = {
  donante: { action: 'no_recogida', title: 'El donante registró que no recogiste la donación', text: name => `${name} indicó que nadie recogió la donación.` },
  organizacion: { action: 'cancelar_recojo', title: 'La beneficiaria no podrá recoger tu donación', text: name => `${name} avisó que no podrá recoger la donación.` },
  administrador: { action: 'anular_recojo', title: 'Administración anuló el recojo', text: () => 'Administración anuló el recojo acordado.' }
};
export async function releaseTracking(client, user, t, motivo) {
  if (!BEFORE_PICKUP.includes(t.estado) || t.donacion_estado !== 'en_proceso' || t.solicitud_estado !== 'aceptada')
    fail(409, 'CUSTODY_STARTED', 'Solo se puede anular antes del recojo. Si hubo un problema después, regístralo como incidencia.');
  const rule = RELEASE[user.rol];
  await client.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id_solicitud = ?", [t.id_solicitud]);
  await audit(client, user.id_usuario, 'solicitudes', t.id_solicitud, rule.action, { motivo, id_donacion: t.id_donacion });
  await client.query('DELETE FROM asignaciones WHERE id_donacion = ?', [t.id_donacion]);
  await client.query('DELETE FROM entregas WHERE id_entrega = ?', [t.id_entrega]);
  await audit(client, user.id_usuario, 'entregas', t.id_entrega, rule.action, { motivo, id_solicitud: t.id_solicitud });
  const donation = (await client.query('SELECT * FROM donaciones WHERE id_donacion = ?', [t.id_donacion])).rows[0];
  const open = Date.parse(donation.fecha_limite_recojo) > Date.now() && (!donation.fecha_limite_aprovechamiento || Date.parse(donation.fecha_limite_aprovechamiento) > Date.now());
  await client.query('UPDATE donaciones SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_donacion = ?', [open ? 'disponible' : 'expirada', t.id_donacion]);
  if (open) {
    // Marca de nueva publicación: los pasos anteriores quedan en el historial, pero no en el próximo seguimiento.
    await client.query("INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, 'publicada', ?, ?)",
      [t.id_donacion, user.id_usuario, String(t.origen.nombre).slice(0, 150), `La donación volvió a publicarse porque se anuló el recojo: ${motivo}`]);
    await audit(client, user.id_usuario, 'donaciones', t.id_donacion, 'reabrir', { motivo, id_solicitud_anulada: t.id_solicitud });
  } else await audit(client, user.id_usuario, 'donaciones', t.id_donacion, 'vencer', { motivo: 'Se anuló el recojo cuando el plazo ya había terminado.' });
  const actorName = user.rol === 'donante' ? t.origen.nombre : t.destino.nombre;
  await notify(client, counterpart(user, t), { titulo: rule.title, mensaje: `${rule.text(actorName)} Motivo: ${motivo}. ${open ? 'La donación volvió a publicarse.' : 'Su plazo ya terminó.'}`, tipo: 'recojo_anulado', id_donacion: t.id_donacion, id_solicitud: t.id_solicitud });
  if (open) {
    const others = (await client.query(`SELECT DISTINCT o.id_usuario FROM solicitudes s JOIN organizaciones o ON o.id_organizacion = s.id_organizacion
      WHERE s.id_donacion = ? AND s.id_solicitud <> ? AND s.estado = 'rechazada'`, [t.id_donacion, t.id_solicitud])).rows.map(row => row.id_usuario);
    await notify(client, others, { titulo: 'Una donación que pediste está disponible otra vez', mensaje: `"${t.alimento}" de ${t.origen.nombre} volvió a publicarse. Si aún la necesitas, envía tu solicitud de nuevo.`, tipo: 'donacion_reabierta', id_donacion: t.id_donacion });
  }
  return { id_donacion: t.id_donacion, reabierta: open, estado_donacion: open ? 'disponible' : 'expirada' };
}
custodyRouter.post('/seguimiento/:id/anular', async (req, res) => {
  const motivo = text(req.body.motivo, 'motivo', 5, 1000);
  const trackingId = id(req.params.id);
  res.json({ data: await transaction(async client => releaseTracking(client, req.user, await trackingFor(req.user, trackingId, client, true), motivo)) });
});

// Incidencias: se leen de la tabla directamente, así no se pierden las de un recojo que se anuló.
async function loadIncidents(where, params, client = db) {
  const rows = (await client.query(`SELECT i.*, u.nombres, u.apellidos, d.nombre_alimento, d.id_donante, s.id_organizacion, e.id_entrega,
      dt.nombre_establecimiento, o.nombre AS organizacion_nombre
    FROM incidencias i LEFT JOIN usuarios u ON u.id_usuario = i.id_usuario
    JOIN donaciones d ON d.id_donacion = i.id_donacion JOIN donantes dt ON dt.id_donante = d.id_donante
    LEFT JOIN solicitudes s ON s.id_solicitud = i.id_solicitud LEFT JOIN organizaciones o ON o.id_organizacion = s.id_organizacion
    LEFT JOIN entregas e ON e.id_solicitud = i.id_solicitud ${where} ORDER BY i.id_incidencia DESC LIMIT 200`, params)).rows;
  const details = await auditDetails(client, 'incidencias', rows.map(row => row.id_incidencia), ['reportar', 'resolver']);
  return rows.map(row => ({ ...incidentFromRow(row, details), alimento: row.nombre_alimento, origen: { nombre: row.nombre_establecimiento }, destino: { nombre: row.organizacion_nombre || '' } }));
}
custodyRouter.get('/incidencias', async (req, res) => {
  const where = req.user.rol === 'administrador' ? '' : req.user.rol === 'donante' ? 'WHERE d.id_donante = ?' : 'WHERE s.id_organizacion = ?';
  const params = req.user.rol === 'administrador' ? [] : [req.user.rol === 'donante' ? req.user.perfil?.id_donante || -1 : req.user.perfil?.id_organizacion || -1];
  const list = await loadIncidents(where, params);
  list.sort((a, b) => (a.estado === 'abierta' ? 0 : 1) - (b.estado === 'abierta' ? 0 : 1) || new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
  res.json({ data: list });
});
function incidentInput(body) {
  const type = text(body.tipo, 'tipo', 3, 40), severity = text(body.severidad, 'severidad', 3, 20);
  if (!['demora', 'temperatura', 'envase', 'calidad', 'otro'].includes(type) || !SEVERITIES.includes(severity)) fail(422, 'INCIDENT_INVALID', 'Selecciona tipo y gravedad válidos.');
  return { type, severity, title: text(body.titulo, 'título', 5, 180), description: text(body.descripcion, 'descripción', 10, 2500) };
}
export async function reportIncident(client, user, trackingId, body) {
  const { type, severity, title, description } = incidentInput(body);
  const t = await trackingFor(user, trackingId, client, true);
  const created = await client.query('INSERT INTO incidencias (id_donacion, id_solicitud, id_usuario, tipo, descripcion) VALUES (?, ?, ?, ?, ?)', [t.id_donacion, t.id_solicitud, user.id_usuario, type, description]);
  await audit(client, user.id_usuario, 'incidencias', created.insertId, 'reportar', { id_entrega: t.id_entrega, tipo: type, severidad: severity, titulo: title });
  await notify(client, counterpart(user, t), { titulo: 'Se reportó una incidencia', mensaje: `${title} (${t.alimento}). Administración la revisará.`, tipo: 'incidencia', id_donacion: t.id_donacion, id_solicitud: t.id_solicitud });
  const [incident] = await loadIncidents('WHERE i.id_incidencia = ?', [created.insertId], client);
  return incident;
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
    const parties = (await client.query(`SELECT dt.id_usuario AS donante, o.id_usuario AS organizacion FROM incidencias i JOIN donaciones d ON d.id_donacion = i.id_donacion
      JOIN donantes dt ON dt.id_donante = d.id_donante LEFT JOIN solicitudes s ON s.id_solicitud = i.id_solicitud LEFT JOIN organizaciones o ON o.id_organizacion = s.id_organizacion
      WHERE i.id_incidencia = ?`, [incidentId])).rows[0];
    await notify(client, [parties.donante, parties.organizacion], { titulo: 'Administración resolvió una incidencia', mensaje: resolution, tipo: 'incidencia_resuelta', id_donacion: incident.id_donacion, id_solicitud: incident.id_solicitud });
    return (await loadIncidents('WHERE i.id_incidencia = ?', [incidentId], client))[0];
  });
  res.json({ data: result });
});
