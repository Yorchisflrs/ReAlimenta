import { Router } from 'express';
import { id } from './validation.js';

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
  };
  const base = { ...config, fecha_calculo: now.toISOString(), estado_viabilidad: 'gris', mensaje: 'No es posible evaluar todavía la viabilidad del recorrido.', advertencias: ['Evaluación logística preliminar. No certifica inocuidad ni verifica físicamente la conservación.'], tiempo_total_estimado_min: null, tiempo_restante_min: null, margen_tiempo_min: null };
  const deadline = donation.fecha_limite_aprovechamiento_declarada ? new Date(donation.fecha_limite_aprovechamiento_declarada) : null;
  if (!deadline || !Number.isFinite(deadline.getTime())) {
    base.advertencias.push('Falta la fecha y hora límite de aprovechamiento declarada.');
    return base;
  }
  base.tiempo_restante_min = (deadline - now) / MINUTE;
  if (!route || !numeric(route.duracion_estimada_min)) {
    base.advertencias.push('No hay una ruta válida con duración devuelta por el proveedor.');
    return base;
  }
  if (donation.requiere_cadena_frio && typeof input.dispone_cadena_frio !== 'boolean') {
    base.advertencias.push('Indique si dispone de medios de transporte para la cadena de frío declarada.');
    return base;
  }
  const scheduled = input.fecha_propuesta ? new Date(input.fecha_propuesta).getTime() : 0;
  const available = new Date(donation.fecha_disponibilidad).getTime();
  const wait = Math.max(0, (Math.max(now.getTime(), Number.isFinite(available) ? available : 0, Number.isFinite(scheduled) ? scheduled : 0) - now) / MINUTE);
  const total = wait + config.preparacion_min + config.recojo_min + Number(route.duracion_estimada_min) + config.entrega_min + config.margen_seguridad_min;
  const margin = base.tiempo_restante_min - total;
  const pickupDeadline = new Date(donation.fecha_limite_recojo).getTime();
  const pickupTime = now.getTime() + (wait + config.preparacion_min + config.recojo_min) * MINUTE;
  Object.assign(base, { espera_programada_min: wait, duracion_transporte_min: Number(route.duracion_estimada_min), tiempo_total_estimado_min: total, margen_tiempo_min: margin });
  if (margin <= 0 || (Number.isFinite(pickupDeadline) && pickupTime >= pickupDeadline) || (donation.requiere_cadena_frio && input.dispone_cadena_frio === false)) {
    base.estado_viabilidad = 'rojo';
    base.mensaje = 'El traslado no es logísticamente viable bajo las condiciones actuales.';
    if (margin <= 0) base.advertencias.push('La duración total alcanza o supera el tiempo disponible declarado.');
    if (pickupTime >= pickupDeadline) base.advertencias.push('El recojo estimado queda fuera de la ventana de recojo.');
    if (donation.requiere_cadena_frio && input.dispone_cadena_frio === false) base.advertencias.push('No se declaró disponibilidad de medios para mantener la cadena de frío requerida.');
  } else if (margin < config.umbral_verde_min) {
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

export async function calculateRoute(origin, destination) {
  if (!validCoordinates(origin.latitud, origin.longitud) || !validCoordinates(destination.latitud, destination.longitud)) throw error(422, 'COORDENADAS_INVALIDAS', 'Confirme las coordenadas de origen y destino antes de calcular la ruta.');
  const provider = process.env.ROUTING_PROVIDER || 'osrm';
  const key = `route:${provider}:${process.env.OSRM_URL || ''}:${origin.longitud},${origin.latitud};${destination.longitud},${destination.latitud}`;
  const raw = await cached(key, 60 * MINUTE, () => serialProvider('routing', async () => {
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
  if (raw.geometry?.type !== 'LineString' || !Array.isArray(raw.geometry.coordinates) || raw.geometry.coordinates.length < 2 || raw.geometry.coordinates.some(point => !Array.isArray(point) || !validCoordinates(point[1], point[0])) || !numeric(raw.distance) || !numeric(raw.duration) || Number(raw.distance) < 0 || Number(raw.duration) < 0) throw error(502, 'RESPUESTA_INVALIDA', 'El proveedor no devolvió una ruta de carretera válida.');
  return { geometry: raw.geometry, distancia_km: Number(raw.distance) / 1000, duracion_estimada_min: Number(raw.duration) / 60, proveedor: raw.proveedor, fecha_calculo: raw.fecha_calculo, fecha_consulta: new Date().toISOString(), cache_max_min: 60, origen: { latitud: Number(origin.latitud), longitud: Number(origin.longitud) }, destino: { latitud: Number(destination.latitud), longitud: Number(destination.longitud) }, medio_transporte: 'Vehículo por carretera', trafico_en_vivo: false };
}

export function createLogisticsRouter({ pool, requireAuth }) {
  const router = Router();
  const geocodeLimits = new Map();
  router.get('/geocode', async (req, res) => {
    const key = req.ip;
    let entry = geocodeLimits.get(key);
    if (!entry || entry.until < Date.now()) { entry = { count: 0, until: Date.now() + MINUTE }; geocodeLimits.set(key, entry); }
    if (++entry.count > 10) throw error(429, 'CONSULTAS_LIMITADAS', 'Realice como máximo 10 búsquedas de dirección por minuto.');
    if (geocodeLimits.size > 1000) geocodeLimits.delete(geocodeLimits.keys().next().value);
    res.json({ data: await geocode(req.query.q) });
  });
  router.post('/donaciones/:id/evaluacion', requireAuth, async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM donacion WHERE id_donacion=$1', [id(req.params.id)]);
    const donation = rows[0];
    if (!donation) throw error(404, 'NO_ENCONTRADO', 'La donación no existe.');
    let organization;
    let requestId = null;
    let input = { ...req.body };
    if (req.user.rol === 'organizacion') {
      organization = req.user.perfil;
      const ownRequest = req.body.id_solicitud
        ? (await pool.query('SELECT * FROM solicitud WHERE id_donacion=$1 AND id_organizacion=$2 AND id_solicitud=$3', [donation.id_donacion, organization?.id_organizacion || -1, id(req.body.id_solicitud)])).rows[0]
        : (await pool.query('SELECT * FROM solicitud WHERE id_donacion=$1 AND id_organizacion=$2 ORDER BY fecha_creacion DESC LIMIT 1', [donation.id_donacion, organization?.id_organizacion || -1])).rows[0];
      if (req.body.id_solicitud && !ownRequest) throw error(403, 'PROHIBIDO', 'La solicitud no pertenece a su organización.');
      const donorEligible = (await pool.query("SELECT 1 FROM donante d JOIN usuario u USING(id_usuario) WHERE d.id_donante=$1 AND d.estado_verificacion='verificado' AND u.estado='activo'", [donation.id_donante])).rowCount > 0;
      if (!ownRequest && (donation.estado !== 'disponible' || Date.parse(donation.fecha_limite_recojo) <= Date.now() || !donorEligible)) throw error(403, 'PROHIBIDO', 'Esta donación no está disponible para su organización.');
      if (ownRequest) { requestId = ownRequest.id_solicitud; input.fecha_propuesta ||= ownRequest.fecha_propuesta; }
    } else if (['donante', 'administrador'].includes(req.user.rol)) {
      if (req.user.rol === 'donante' && String(donation.id_donante) !== String(req.user.perfil?.id_donante)) throw error(403, 'PROHIBIDO', 'Solo puede consultar rutas de sus propias donaciones.');
      if (!req.body.id_solicitud) throw error(422, 'SOLICITUD_REQUERIDA', 'Seleccione una solicitud para identificar a la organización de destino.');
      const request = (await pool.query('SELECT s.*, o.latitud, o.longitud FROM solicitud s JOIN organizacion o USING(id_organizacion) WHERE s.id_solicitud=$1 AND s.id_donacion=$2', [id(req.body.id_solicitud), donation.id_donacion])).rows[0];
      if (!request) throw error(404, 'NO_ENCONTRADO', 'La solicitud no pertenece a esta donación.');
      organization = request;
      requestId = request.id_solicitud;
      input.fecha_propuesta = request.fecha_propuesta;
      if (typeof input.dispone_cadena_frio !== 'boolean') input.dispone_cadena_frio = request.dispone_cadena_frio;
    } else throw error(403, 'PROHIBIDO', 'El rol no permite evaluar esta ruta.');
    let route = null;
    if (validCoordinates(donation.latitud_recojo, donation.longitud_recojo) && validCoordinates(organization?.latitud, organization?.longitud)) {
      route = await calculateRoute({ latitud: donation.latitud_recojo, longitud: donation.longitud_recojo }, organization);
    }
    const evaluation = evaluateLogistics(donation, route, input);
    if (!route) evaluation.advertencias.push('Confirme las coordenadas del donante y la organización en sus perfiles.');
    const detail = { ...evaluation, ruta: route, parametros: input };
    await pool.query(`INSERT INTO evaluacion_ruta(id_donacion,id_solicitud,id_usuario,id_organizacion,origen_latitud,origen_longitud,destino_latitud,destino_longitud,distancia_km,duracion_estimada_min,tiempo_total_estimado_min,margen_tiempo_min,estado_viabilidad,proveedor_ruta,detalle,geometria) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [donation.id_donacion, requestId, req.user.id_usuario, organization?.id_organizacion ?? null, donation.latitud_recojo, donation.longitud_recojo, organization?.latitud ?? null, organization?.longitud ?? null, route?.distancia_km ?? null, route?.duracion_estimada_min ?? null, evaluation.tiempo_total_estimado_min, evaluation.margen_tiempo_min, evaluation.estado_viabilidad, route?.proveedor || 'Sin ruta calculable', JSON.stringify(detail), route ? JSON.stringify(route.geometry) : null]);
    res.json({ data: { ruta: route, evaluacion: evaluation } });
  });
  return router;
}
