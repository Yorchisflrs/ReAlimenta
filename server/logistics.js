import { Router } from 'express';
import { id } from './validation.js';
import { donationFromRow, organizationProfile, coldChainDeclared } from './mappers.js';
import { db as mainDb, transaction, audit, placeholders } from './db.js';
import { parseDetail } from './mappers.js';

const MINUTE = 60_000;
const error = (status, code, message) => Object.assign(new Error(message), { status, code });
const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export function validCoordinates(lat, lng) {
  return numeric(lat) && numeric(lng) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

function minutes(value, fallback, name) {
  const result = value === undefined || value === '' ? Number(fallback) : Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1440) throw error(422, 'TIEMPO_INVALIDO', `${name} debe estar entre 0 y 1440 minutos.`);
  return result;
}

export function evaluateLogistics(donation, route, input = {}, now = new Date()) {
  const config = {
    preparacion_min: minutes(input.preparacion_min, process.env.LOGISTICS_PREPARATION_MIN || 15, 'La preparación'),
    recojo_min: minutes(input.recojo_min, process.env.LOGISTICS_PICKUP_MIN || 10, 'El recojo'),
    entrega_min: minutes(input.entrega_min, process.env.LOGISTICS_DELIVERY_MIN || 10, 'La entrega'),
    margen_seguridad_min: minutes(input.margen_seguridad_min, process.env.LOGISTICS_SAFETY_MIN || 15, 'El margen logístico'),
    umbral_verde_min: minutes(undefined, process.env.LOGISTICS_GREEN_MARGIN_MIN || 30, 'El umbral verde'),
    demora_trafico_min: minutes(input.demora_trafico_min, 0, 'La demora del escenario de tráfico'),
    viaje_recojo_min: minutes(input.viaje_recojo_min, 0, 'El viaje de la beneficiaria al punto de recojo'),
  };
  const moved = ['recogido', 'en_transito', 'entregado', 'confirmado'].includes(input.etapa_custodia);
  const arrived = ['entregado', 'confirmado'].includes(input.etapa_custodia);
  if (moved) { config.preparacion_min = 0; config.recojo_min = 0; config.viaje_recojo_min = 0; }
  if (arrived) { config.entrega_min = 0; config.demora_trafico_min = 0; config.margen_seguridad_min = 0; }
  const base = { ...config, fecha_calculo: now.toISOString(), estado_viabilidad: 'gris', mensaje: 'No es posible evaluar todavía la viabilidad del recorrido.', advertencias: ['Evaluación logística preliminar. No certifica inocuidad ni verifica físicamente la conservación.'], tiempo_total_estimado_min: null, tiempo_restante_min: null, margen_tiempo_min: null };
  const badCondition = input.condicion_declarada === 'no_conforme' || Number(input.incidencias_criticas || 0) > 0;
  if(badCondition){base.estado_viabilidad='rojo';base.mensaje='Hay una condición no conforme o una incidencia crítica abierta. Detenga la coordinación y solicite revisión.';}
  const deadline = donation.fecha_limite_aprovechamiento_declarada ? new Date(donation.fecha_limite_aprovechamiento_declarada) : null;
  if (!deadline || !Number.isFinite(deadline.getTime())) {
    base.advertencias.push('Falta la fecha y hora límite de aprovechamiento declarada.');
    return base;
  }
  base.tiempo_restante_min = (deadline - now) / MINUTE;
  if(base.tiempo_restante_min<=0){base.estado_viabilidad='rojo';base.mensaje='El límite de aprovechamiento declarado ya finalizó. Requiere revisión; no se autoriza consumo.';}
  if (!route || !numeric(route.duracion_estimada_min)) {
    base.advertencias.push('No hay una ruta válida con duración devuelta por el proveedor.');
    return base;
  }
  if (donation.requiere_cadena_frio && typeof input.dispone_cadena_frio !== 'boolean') {
    base.advertencias.push('Indique si dispone de medios de transporte para la cadena de frío declarada.');
    return base;
  }
  const scheduled = !moved && input.fecha_propuesta ? new Date(input.fecha_propuesta).getTime() : 0;
  const available = new Date(donation.fecha_disponibilidad).getTime();
  const wait = moved ? 0 : Math.max(0, (Math.max(now.getTime(), Number.isFinite(available) ? available : 0, Number.isFinite(scheduled) ? scheduled : 0) - now) / MINUTE);
  const transport = arrived ? 0 : Number(route.duracion_estimada_min);
  const total = wait + config.preparacion_min + config.viaje_recojo_min + config.recojo_min + transport + config.demora_trafico_min + config.entrega_min + config.margen_seguridad_min;
  const margin = base.tiempo_restante_min - total;
  const pickupDeadline = new Date(donation.fecha_limite_recojo).getTime();
  const pickupTime = now.getTime() + (wait + config.preparacion_min + config.viaje_recojo_min + config.recojo_min) * MINUTE;
  Object.assign(base, { espera_programada_min: wait, duracion_transporte_min: transport, duracion_base_ruta_min: Number(route.duracion_estimada_min), duracion_con_escenario_min: transport + config.demora_trafico_min, tiempo_total_estimado_min: total, margen_tiempo_min: margin, llegada_estimada: new Date(now.getTime() + total * MINUTE).toISOString(), trafico_en_vivo: false });
  if (moved && !arrived) base.advertencias.push('Traslado registrado manualmente. Se conserva el recorrido completo como previsión conservadora; no existe localización GPS en vivo.');
  if (config.demora_trafico_min > 0) base.advertencias.push(`Escenario manual: ${config.demora_trafico_min} minutos adicionales por tráfico. No procede de tráfico en vivo.`);
  if (margin <= 0 || (!moved && Number.isFinite(pickupDeadline) && pickupTime >= pickupDeadline) || (donation.requiere_cadena_frio && input.dispone_cadena_frio === false) || badCondition) {
    base.estado_viabilidad = 'rojo';
    base.mensaje = 'El traslado no es logísticamente viable bajo las condiciones actuales.';
    if (margin <= 0) base.advertencias.push('La duración total alcanza o supera el tiempo disponible declarado.');
    if (!moved && pickupTime >= pickupDeadline) base.advertencias.push('El recojo estimado queda fuera de la ventana de recojo.');
    if (donation.requiere_cadena_frio && input.dispone_cadena_frio === false) base.advertencias.push('No se declaró disponibilidad de medios para mantener la cadena de frío requerida.');
    if (badCondition) base.advertencias.push('Existe una condición no conforme o una incidencia crítica abierta: requiere revisión, no autoriza consumo.');
  } else if (margin < config.umbral_verde_min || input.condicion_declarada === 'requiere_revision' || Number(input.incidencias_abiertas || 0) > 0) {
    base.estado_viabilidad = 'amarillo';
    base.mensaje = 'El traslado presenta un margen de tiempo reducido. Verifique las condiciones antes de coordinar.';
  } else {
    base.estado_viabilidad = 'verde';
    base.mensaje = 'Según la duración estimada y el límite declarado, el traslado dispone de margen logístico suficiente.';
  }
  return base;
}

// Cache de consultas externas, nunca sustituye la persistencia de donaciones/solicitudes.
const cache = new Map();
const queues = new Map();
let pendingProviderCalls = 0;
function serialProvider(name, fn) {
  if (pendingProviderCalls >= 12) throw error(429, 'CONSULTAS_LIMITADAS', 'Hay varias consultas cartográficas pendientes. Espere unos segundos y reintente.');
  pendingProviderCalls += 1;
  const prior = queues.get(name) || Promise.resolve();
  const next = prior.catch(() => {}).then(async () => {
    const result = await fn();
    return result;
  });
  queues.set(name, next.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, 1100))));
  return next.finally(() => { pendingProviderCalls -= 1; });
}
async function cached(key, ttl, fn) {
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return existing.value;
  const value = await fn();
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  cache.set(key, { value, until: Date.now() + ttl });
  return value;
}
async function providerJSON(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': process.env.MAP_USER_AGENT || 'REAlimenta-Academic-Local/2.0', 'Accept': 'application/json', ...options.headers } });
  } catch {
    throw error(502, 'PROVEEDOR_NO_DISPONIBLE', 'El proveedor cartográfico no respondió. Puede reintentar; no se estimó una ruta ficticia.');
  }
  if (!response.ok) throw error(502, 'PROVEEDOR_NO_DISPONIBLE', 'El proveedor cartográfico rechazó la consulta. Intente nuevamente más tarde.');
  try { return await response.json(); } catch { throw error(502, 'RESPUESTA_INVALIDA', 'El proveedor devolvió una respuesta que no puede interpretarse.'); }
}

export async function geocode(query) {
  if (typeof query !== 'string' || query.trim().length < 3 || query.length > 200) throw error(422, 'DIRECCION_INVALIDA', 'Escriba una dirección de 3 a 200 caracteres.');
  const q = query.trim();
  return cached(`geo:${q.toLocaleLowerCase('es')}`, 24 * 60 * MINUTE, () => serialProvider('nominatim', async () => {
    const url = new URL('/search', process.env.GEOCODING_URL || 'https://nominatim.openstreetmap.org');
    url.search = new URLSearchParams({ q, format: 'jsonv2', limit: '5', countrycodes: 'pe', 'accept-language': 'es' }).toString();
    const result = await providerJSON(url);
    if (!Array.isArray(result)) throw error(502, 'RESPUESTA_INVALIDA', 'No se pudo interpretar la búsqueda de dirección.');
    return result.filter(item => validCoordinates(item.lat, item.lon)).map(item => ({ display_name: item.display_name, latitud: Number(item.lat), longitud: Number(item.lon), proveedor: 'Nominatim / OpenStreetMap' }));
  }));
}

const routeKey = (origin, destination) => `route:${process.env.ROUTING_PROVIDER || 'osrm'}:${process.env.OSRM_URL || ''}:${Number(origin.longitud)},${Number(origin.latitud)};${Number(destination.longitud)},${Number(destination.latitud)}`;
function normalizeRoute(raw, origin, destination) {
  if (raw.geometry?.type !== 'LineString' || !Array.isArray(raw.geometry.coordinates) || raw.geometry.coordinates.length < 2 || raw.geometry.coordinates.some(point => !Array.isArray(point) || !validCoordinates(point[1], point[0])) || !numeric(raw.distance) || !numeric(raw.duration) || Number(raw.distance) < 0 || Number(raw.duration) < 0) throw error(502, 'RESPUESTA_INVALIDA', 'El proveedor no devolvió una ruta de carretera válida.');
  return { geometry: raw.geometry, distancia_km: Number(raw.distance) / 1000, duracion_estimada_min: Number(raw.duration) / 60, proveedor: raw.proveedor, fecha_calculo: raw.fecha_calculo, fecha_consulta: new Date().toISOString(), cache_max_min: 60, origen: { latitud: Number(origin.latitud), longitud: Number(origin.longitud) }, destino: { latitud: Number(destination.latitud), longitud: Number(destination.longitud) }, medio_transporte: 'Vehículo por carretera', trafico_en_vivo: false };
}

export async function calculateRoute(origin, destination) {
  if (!validCoordinates(origin.latitud, origin.longitud) || !validCoordinates(destination.latitud, destination.longitud)) throw error(422, 'COORDENADAS_INVALIDAS', 'Confirme las coordenadas de origen y destino antes de calcular la ruta.');
  const provider = process.env.ROUTING_PROVIDER || 'osrm';
  const raw = await cached(routeKey(origin, destination), 60 * MINUTE, () => serialProvider('routing', async () => {
    if (provider === 'ors') {
      if (!process.env.ORS_API_KEY) throw error(503, 'CLAVE_RUTAS_PENDIENTE', 'Configure ORS_API_KEY en el backend para utilizar OpenRouteService.');
      const result = await providerJSON('https://api.openrouteservice.org/v2/directions/driving-car/geojson', { method: 'POST', headers: { Authorization: process.env.ORS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [[Number(origin.longitud), Number(origin.latitud)], [Number(destination.longitud), Number(destination.latitud)]] }) });
      const feature = result.features?.[0];
      if (!feature?.geometry || !numeric(feature.properties?.summary?.duration)) throw error(422, 'SIN_RUTA', 'No se pudo calcular una ruta para estas ubicaciones.');
      return { geometry: feature.geometry, distance: feature.properties.summary.distance, duration: feature.properties.summary.duration, proveedor: 'OpenRouteService', fecha_calculo: new Date().toISOString() };
    }
    if (provider !== 'osrm') throw error(503, 'PROVEEDOR_INVALIDO', 'El proveedor de rutas no está configurado correctamente.');
    const base = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
    const coords = `${Number(origin.longitud)},${Number(origin.latitud)};${Number(destination.longitud)},${Number(destination.latitud)}`;
    const result = await providerJSON(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
    if (result.code !== 'Ok' || !result.routes?.[0]?.geometry || !numeric(result.routes[0].duration)) throw error(422, 'SIN_RUTA', 'No se pudo calcular una ruta para estas ubicaciones.');
    return { ...result.routes[0], proveedor: 'OSRM / OpenStreetMap (servicio público académico)', fecha_calculo: new Date().toISOString() };
  }));
  return normalizeRoute(raw, origin, destination);
}

// Cada sentido se consulta por carretera: la ida no se infiere invirtiendo una polilínea.
export async function calculateJourney(origin, destination, { pickup = true } = {}) {
  const ruta = await calculateRoute(origin, destination);
  const ruta_recojo = pickup ? await calculateRoute(destination, origin) : null;
  return { ruta, ruta_recojo };
}

const PLAN_FIELDS = ['preparacion_min', 'recojo_min', 'entrega_min', 'margen_seguridad_min', 'demora_trafico_min', 'viaje_recojo_min', 'dispone_cadena_frio'];
export async function attachEvaluationDetails(evaluations, client = mainDb) {
  if (!evaluations.length) return evaluations;
  const details = (await client.query(`SELECT id_registro, descripcion FROM auditoria WHERE tabla_afectada = 'evaluaciones_ruta'
    AND accion = 'calcular' AND id_registro IN (${placeholders(evaluations)}) ORDER BY id_auditoria`, evaluations.map(e => e.id_evaluacion))).rows;
  const byId = new Map(details.map(row => [row.id_registro, parseDetail(row.descripcion)]));
  for (const evaluation of evaluations) Object.assign(evaluation, byId.get(evaluation.id_evaluacion) || {});
  return evaluations;
}

export function pickupFromEvaluation(evaluation) {
  const saved = evaluation?.ruta_recojo;
  if (!saved?.origen || !saved.destino) return null;
  return { ...saved, geometry: peekRoute(saved.origen, saved.destino)?.geometry };
}

export function evaluationMatches(evaluation, origin, destination) {
  return [[evaluation.origen_latitud, origin?.latitud], [evaluation.origen_longitud, origin?.longitud],
    [evaluation.destino_latitud, destination?.latitud], [evaluation.destino_longitud, destination?.longitud]]
    .every(([saved, current]) => numeric(saved) && numeric(current) && Math.abs(Number(saved) - Number(current)) < 0.000001);
}
// evaluaciones_ruta no guarda la polilínea: se reutiliza la geometría solo mientras siga en la caché del proceso.
export function peekRoute(origin, destination) {
  if (!validCoordinates(origin?.latitud, origin?.longitud) || !validCoordinates(destination?.latitud, destination?.longitud)) return null;
  const entry = cache.get(routeKey(origin, destination));
  if (!entry || entry.until <= Date.now()) return null;
  try { return normalizeRoute(entry.value, origin, destination); } catch { return null; }
}
export function routeFromEvaluation(e) {
  const origen = { latitud: e.origen_latitud, longitud: e.origen_longitud }, destino = { latitud: e.destino_latitud, longitud: e.destino_longitud };
  const live = peekRoute(origen, destino);
  return { ...(live || {}), distancia_km: Number(e.distancia_km), duracion_estimada_min: Number(e.duracion_estimada_min), proveedor: e.proveedor_mapa,
    fecha_calculo: e.fecha_calculo, origen, destino, medio_transporte: 'Vehículo por carretera', trafico_en_vivo: false, geometry: live?.geometry };
}
const decimal = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.max(-99999999.99, Math.min(99999999.99, Math.round(Number(value) * 100) / 100));
const coordinate = (value, limit) => numeric(value) && Math.abs(Number(value)) <= limit ? Number(value) : null;
// Columnas reales de evaluaciones_ruta. id_organizacion es obligatorio en el esquema.
export async function saveEvaluation(client, args) {
  if (client === mainDb) return transaction(tx => saveEvaluation(tx, args));
  const { donationId, organizationId, requestId = null, origin, destination, route, pickupRoute = null, evaluation, actorId = null, input = {} } = args;
  if (!organizationId) return;
  const inserted = await client.query(`INSERT INTO evaluaciones_ruta (id_donacion, id_organizacion, id_solicitud, origen_latitud, origen_longitud, destino_latitud, destino_longitud,
    distancia_km, duracion_estimada_min, tiempo_preparacion_min, tiempo_recojo_min, tiempo_entrega_min, tiempo_total_estimado_min, tiempo_disponible_min,
    margen_tiempo_min, semaforo, proveedor_mapa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    donationId, organizationId, requestId ?? null, coordinate(origin?.latitud, 90), coordinate(origin?.longitud, 180), coordinate(destination?.latitud, 90), coordinate(destination?.longitud, 180),
    decimal(route?.distancia_km), decimal(route?.duracion_estimada_min), decimal(evaluation.preparacion_min), decimal(evaluation.recojo_min), decimal(evaluation.entrega_min),
    decimal(evaluation.tiempo_total_estimado_min), decimal(evaluation.tiempo_restante_min), decimal(evaluation.margen_tiempo_min),
    ['verde', 'amarillo', 'rojo', 'gris'].includes(evaluation.estado_viabilidad) ? evaluation.estado_viabilidad : 'gris',
    String(route?.proveedor || 'Sin ruta calculable').slice(0, 100)]);
  const planificacion = Object.fromEntries(PLAN_FIELDS.filter(key => Object.hasOwn(evaluation, key) || Object.hasOwn(input, key)).map(key => [key, evaluation[key] ?? input[key]]));
  const pickupSummary = pickupRoute ? Object.fromEntries(['distancia_km', 'duracion_estimada_min', 'proveedor', 'fecha_calculo', 'origen', 'destino', 'trafico_en_vivo'].map(key => [key, pickupRoute[key]])) : null;
  await audit(client, actorId, 'evaluaciones_ruta', inserted.insertId, 'calcular', { planificacion, ruta_recojo: pickupSummary });
  return inserted.insertId;
}

const eligibleUser = "u.estado IN ('activo','pendiente')";
export function createLogisticsRouter({ db, requireAuth }) {
  const router = Router();
  const geocodeLimits = new Map();
  router.get('/destinos', requireAuth, async (req, res) => {
    const self = req.user.rol === 'organizacion';
    const rows = (await db.query(`SELECT o.* FROM organizaciones o JOIN usuarios u ON u.id_usuario = o.id_usuario
      WHERE o.estado_verificacion = 'verificado' AND ${eligibleUser} ${self ? 'AND o.id_organizacion = ?' : ''} ORDER BY o.id_organizacion LIMIT 100`, self ? [req.user.perfil?.id_organizacion || -1] : [])).rows;
    res.json({ data: rows.map(organizationProfile).map(({ id_organizacion, nombre, direccion, distrito, latitud, longitud }) => ({ id_organizacion, nombre, direccion, distrito, latitud, longitud })) });
  });
  router.get('/geocode', async (req, res) => {
    const key = req.ip;
    let entry = geocodeLimits.get(key);
    if (!entry || entry.until < Date.now()) { entry = { count: 0, until: Date.now() + MINUTE }; geocodeLimits.set(key, entry); }
    if (++entry.count > 10) throw error(429, 'CONSULTAS_LIMITADAS', 'Realice como máximo 10 búsquedas de dirección por minuto.');
    if (geocodeLimits.size > 1000) geocodeLimits.delete(geocodeLimits.keys().next().value);
    res.json({ data: await geocode(req.query.q) });
  });
  // Estimación simple: solo punto de salida y punto de llegada; la hora de llegada la suma el navegador.
  const estimateLimits = new Map();
  router.post('/rutas/estimar', requireAuth, async (req, res) => {
    const key = req.user.id_usuario;
    let entry = estimateLimits.get(key);
    if (!entry || entry.until < Date.now()) { entry = { count: 0, until: Date.now() + MINUTE }; estimateLimits.set(key, entry); }
    if (++entry.count > 20) throw error(429, 'CONSULTAS_LIMITADAS', 'Hiciste muchos cálculos seguidos. Espera un minuto y vuelve a intentarlo.');
    if (estimateLimits.size > 1000) estimateLimits.delete(estimateLimits.keys().next().value);
    const origin = { latitud: req.body.origen?.latitud, longitud: req.body.origen?.longitud };
    const destination = { latitud: req.body.destino?.latitud, longitud: req.body.destino?.longitud };
    if (!validCoordinates(origin.latitud, origin.longitud) || !validCoordinates(destination.latitud, destination.longitud)) throw error(422, 'COORDENADAS_INVALIDAS', 'Marca en el mapa desde dónde sales.');
    const route = await calculateRoute(origin, destination);
    res.json({ data: { geometry: route.geometry, distancia_km: route.distancia_km, duracion_estimada_min: route.duracion_estimada_min, proveedor: route.proveedor } });
  });
  router.post('/donaciones/:id/evaluacion', requireAuth, async (req, res) => {
    const found = (await db.query('SELECT d.*, dt.* FROM donaciones d JOIN donantes dt ON dt.id_donante = d.id_donante WHERE d.id_donacion = ?', [id(req.params.id)], { nestTables: true })).rows[0];
    if (!found) throw error(404, 'NO_ENCONTRADO', 'La donación no existe.');
    const donation = donationFromRow(found.d, found.dt);
    let organization;
    let requestId = null;
    // Solo estos parámetros puede elegir el cliente. Las condiciones de custodia proceden de MySQL.
    let input = Object.fromEntries(['preparacion_min','recojo_min','entrega_min','margen_seguridad_min','demora_trafico_min','dispone_cadena_frio','fecha_propuesta'].filter(key => Object.hasOwn(req.body,key)).map(key => [key,req.body[key]]));
    if (req.user.rol === 'organizacion') {
      organization = req.user.perfil;
      const orgId = organization?.id_organizacion || -1;
      const ownRequest = req.body.id_solicitud
        ? (await db.query('SELECT * FROM solicitudes WHERE id_donacion = ? AND id_organizacion = ? AND id_solicitud = ?', [donation.id_donacion, orgId, id(req.body.id_solicitud)])).rows[0]
        : (await db.query('SELECT * FROM solicitudes WHERE id_donacion = ? AND id_organizacion = ? ORDER BY fecha_solicitud DESC, id_solicitud DESC LIMIT 1', [donation.id_donacion, orgId])).rows[0];
      if (req.body.id_solicitud && !ownRequest) throw error(403, 'PROHIBIDO', 'La solicitud no pertenece a su entidad beneficiaria.');
      const donorEligible = (await db.query(`SELECT 1 FROM donantes d JOIN usuarios u ON u.id_usuario = d.id_usuario WHERE d.id_donante = ? AND d.estado_verificacion = 'verificado' AND ${eligibleUser}`, [donation.id_donante])).rowCount > 0;
      if (!ownRequest && (donation.estado !== 'disponible' || Date.parse(donation.fecha_limite_recojo) <= Date.now() || !donorEligible)) throw error(403, 'PROHIBIDO', 'Esta donación no está disponible para su entidad beneficiaria.');
      if (ownRequest) { requestId = ownRequest.id_solicitud; input.fecha_propuesta ||= ownRequest.fecha_recojo_propuesta; }
    } else if (['donante', 'administrador'].includes(req.user.rol)) {
      if (req.user.rol === 'donante' && String(donation.id_donante) !== String(req.user.perfil?.id_donante)) throw error(403, 'PROHIBIDO', 'Solo puede consultar rutas de sus propias donaciones.');
      if (req.body.id_solicitud) {
        const request = (await db.query('SELECT s.*, o.* FROM solicitudes s JOIN organizaciones o ON o.id_organizacion = s.id_organizacion WHERE s.id_solicitud = ? AND s.id_donacion = ?', [id(req.body.id_solicitud), donation.id_donacion], { nestTables: true })).rows[0];
        if (!request) throw error(404, 'NO_ENCONTRADO', 'La solicitud no pertenece a esta donación.');
        organization = organizationProfile(request.o);
        requestId = request.s.id_solicitud;
        input.fecha_propuesta = request.s.fecha_recojo_propuesta;
        if (typeof input.dispone_cadena_frio !== 'boolean') input.dispone_cadena_frio = coldChainDeclared(request.s.mensaje);
      } else {
        if (!req.body.id_organizacion) throw error(422, 'SOLICITUD_REQUERIDA', 'Seleccione una beneficiaria de destino o una solicitud para evaluar el recorrido.');
        organization = organizationProfile((await db.query(`SELECT o.* FROM organizaciones o JOIN usuarios u ON u.id_usuario = o.id_usuario WHERE o.id_organizacion = ? AND o.estado_verificacion = 'verificado' AND ${eligibleUser}`, [id(req.body.id_organizacion)])).rows[0]);
        if (!organization) throw error(422, 'DESTINO_INVALIDO', 'Seleccione una beneficiaria verificada.');
      }
    } else throw error(403, 'PROHIBIDO', 'El rol no permite evaluar esta ruta.');
    if(requestId){
      const delivery=(await db.query("SELECT e.id_entrega FROM entregas e JOIN solicitudes s ON s.id_solicitud=e.id_solicitud WHERE e.id_solicitud=? AND s.estado='aceptada'",[requestId])).rows[0];
      if(delivery){
        // La vista de detalle y Seguimiento deben aplicar la misma etapa real y las mismas incidencias.
        const {getTracking,evaluateTracking}=await import('./custody.js');
        const tracking=await getTracking(req.user,delivery.id_entrega);
        return res.json({data:await evaluateTracking(tracking,req.user,input)});
      }
    }
    const origin = { latitud: donation.latitud_recojo, longitud: donation.longitud_recojo };
    let route = null, pickupRoute = null;
    if (validCoordinates(origin.latitud, origin.longitud) && validCoordinates(organization?.latitud, organization?.longitud)) {
      const journey = await calculateJourney(origin, organization);
      route = journey.ruta; pickupRoute = journey.ruta_recojo;
    }
    input.viaje_recojo_min = pickupRoute?.duracion_estimada_min || 0;
    const evaluation = evaluateLogistics(donation, route, input);
    if (!route) evaluation.advertencias.push('Confirme las coordenadas del donante y la beneficiaria en sus perfiles.');
    await saveEvaluation(db, { donationId: donation.id_donacion, organizationId: organization?.id_organizacion, requestId, origin, destination: organization, route, pickupRoute, evaluation, actorId: req.user.id_usuario, input });
    res.json({ data: { ruta: route, ruta_recojo: pickupRoute, evaluacion: evaluation,
      origen: { ...origin, nombre: donation.donante_nombre || found.dt.nombre_establecimiento, direccion: donation.direccion_recojo },
      destino: { nombre: organization?.nombre, direccion: organization?.direccion } } });
  });
  return router;
}
