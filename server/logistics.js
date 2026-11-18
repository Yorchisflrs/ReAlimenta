import { Router } from 'express';
import { db, transaction, audit } from './db.js';
import { requireAuth, requireRole, requireVerified, canSignIn } from './auth.js';
import { id } from './validation.js';
import { donationFromRow } from './mappers.js';
import { getTracking } from './custody.js';

// Geocodificación y rutas por carretera mediante servicios cartográficos configurables.
const MINUTE = 60_000;
const error = (status, code, message) => Object.assign(new Error(message), { status, code });
const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export function validCoordinates(lat, lng) {
  return numeric(lat) && numeric(lng) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

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
    throw error(502, 'PROVEEDOR_NO_DISPONIBLE', 'El servicio de mapas no respondió. Intenta de nuevo en unos segundos.');
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
  if (!validCoordinates(origin?.latitud, origin?.longitud) || !validCoordinates(destination?.latitud, destination?.longitud))
    throw error(422, 'COORDENADAS_INVALIDAS', 'Marca el lugar de recojo y la ubicación de la beneficiaria antes de calcular.');
  const coords = `${Number(origin.longitud)},${Number(origin.latitud)};${Number(destination.longitud)},${Number(destination.latitud)}`;
  const base = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
  const provider = process.env.ROUTING_PROVIDER || 'osrm';
  if (!['osrm', 'ors'].includes(provider)) throw error(503, 'PROVEEDOR_INVALIDO', 'El proveedor de rutas no está configurado correctamente.');
  return cached(`route:${provider}:${base}:${coords}`, 60 * MINUTE, () => serialProvider('routing', async () => {
    let route, name;
    if (provider === 'ors') {
      if (!process.env.ORS_API_KEY) throw error(503, 'CLAVE_RUTAS_PENDIENTE', 'Falta configurar la clave del servicio de rutas.');
      const result = await providerJSON('https://api.openrouteservice.org/v2/directions/driving-car/geojson', { method:'POST', headers:{ Authorization:process.env.ORS_API_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ coordinates:[[Number(origin.longitud),Number(origin.latitud)],[Number(destination.longitud),Number(destination.latitud)]] }) });
      const feature = result?.features?.[0]; route = { geometry: feature?.geometry, distance: feature?.properties?.summary?.distance, duration: feature?.properties?.summary?.duration }; name = 'OpenRouteService';
    } else {
      const result = await providerJSON(`${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
      route = result?.code === 'Ok' ? result.routes?.[0] : null; name = 'OSRM / OpenStreetMap';
    }
    const points = route?.geometry?.coordinates;
    if (route?.geometry?.type !== 'LineString' || !Array.isArray(points) || points.length < 2 || points.length > 20000 || points.some(p => !Array.isArray(p) || !validCoordinates(p[1], p[0])) || !numeric(route.distance) || !numeric(route.duration) || Number(route.distance) < 0 || Number(route.duration) < 0)
      throw error(502, 'SIN_RUTA', 'No se obtuvo una ruta de carretera válida. Intenta nuevamente.');
    return { geometria: route.geometry, distancia_km: Number(route.distance) / 1000, duracion_min: Number(route.duration) / 60, proveedor: name, trafico_en_vivo: false };
  }));
}

// El color expresa margen de traslado y condiciones declaradas; nunca determina inocuidad.
export function evaluateLogistics(donation, journey, options = {}, now = new Date()) {
  const traffic = Number(options.demora_trafico_min ?? 0);
  if (!Number.isFinite(traffic) || traffic < 0 || traffic > 180) throw error(422, 'TRAFICO_INVALIDO', 'El tiempo adicional debe estar entre 0 y 180 minutos.');
  const moved = ['recogido', 'confirmado', 'con_problemas'].includes(options.etapa);
  const departure = now.getTime();
  const availableAt = Date.parse(donation.fecha_disponibilidad);
  const proposedAt = Date.parse(options.fecha_propuesta);
  const inbound = moved ? 0 : Number(journey?.ida?.duracion_min);
  const outbound = Number(journey?.vuelta?.duracion_min);
  const validRoute = Number.isFinite(inbound) && Number.isFinite(outbound);
  const wait = moved || !validRoute ? 0 : Math.max(0, (Math.max(departure, Number.isFinite(availableAt) ? availableAt : departure, Number.isFinite(proposedAt) ? proposedAt : departure) - departure) / MINUTE - inbound);
  const pickupTime = validRoute ? wait + inbound + (moved ? 0 : 10) : null;
  const total = validRoute ? pickupTime + outbound + traffic : null;
  const deadlines = [donation.fecha_limite_aprovechamiento_declarada, donation.fecha_vencimiento].map(x => Date.parse(x)).filter(Number.isFinite);
  const deadline = deadlines.length ? Math.min(...deadlines) : null;
  const remaining = deadline === null ? null : (deadline - departure) / MINUTE;
  const margin = remaining === null || total === null ? null : remaining - total;
  const pickupDeadline = Date.parse(donation.fecha_limite_recojo);
  const badCondition = options.condicion === 'no_conforme' || Number(options.incidencias_criticas) > 0;
  const missingCold = donation.requiere_cadena_frio && options.dispone_cadena_frio == null;
  const noCold = donation.requiere_cadena_frio && options.dispone_cadena_frio === false;
  let color = 'gris', mensaje = 'Faltan datos para evaluar el traslado.';
  if (badCondition || noCold || (remaining !== null && remaining <= 0) || (margin !== null && margin <= 0) || (!moved && validRoute && Number.isFinite(pickupDeadline) && departure + pickupTime * MINUTE >= pickupDeadline)) {
    color = 'rojo'; mensaje = 'Requiere atención: el tiempo o las condiciones declaradas no permiten completar este plan.';
  } else if (validRoute && remaining !== null && !missingCold) {
    if (margin < 30 || options.condicion === 'requiere_revision' || donation.estado_alimento_declarado === 'requiere_revision' || Number(options.incidencias_abiertas) > 0) {
      color = 'amarillo'; mensaje = 'Hay poco margen o detalles pendientes. Revisa el plan antes de coordinar.';
    } else { color = 'verde'; mensaje = 'Según los tiempos declarados, hay margen para completar el traslado.'; }
  }
  const avisos = [];
  if (remaining === null) avisos.push('El donante no indicó hasta cuándo se puede consumir el alimento.');
  if (!validRoute) avisos.push('No hay un recorrido calculado por el proveedor de mapas.');
  if (missingCold) avisos.push('Falta indicar si disponen de medios para mantener la cadena de frío.');
  if (noCold) avisos.push('El alimento requiere frío y no se han declarado medios para conservarlo.');
  if (badCondition) avisos.push('Hay una condición no conforme o una incidencia crítica abierta.');
  if (moved) avisos.push('El recorrido completo se usa como previsión: no hay GPS en vivo.');
  return { color, mensaje, avisos, demora_trafico_min: traffic, espera_min: wait, recojo_min: moved ? 0 : 10, tiempo_total_min: total, tiempo_disponible_min: remaining, margen_min: margin, trafico_en_vivo: false };
}

async function plan(req, { donation, origin, destination, organizationId, requestId = null, tracking = null }) {
  const traffic = Number(req.body.demora_trafico_min ?? 0);
  if (!Number.isFinite(traffic) || traffic < 0 || traffic > 180) throw error(422, 'TRAFICO_INVALIDO', 'El tiempo adicional debe estar entre 0 y 180 minutos.');
  const cold = tracking ? tracking.dispone_cadena_frio : req.body.dispone_cadena_frio;
  if (cold != null && typeof cold !== 'boolean') throw error(422, 'CADENA_FRIO_INVALIDA', 'Indica si puedes mantener el alimento frío.');
  const moved = tracking && ['recogido', 'confirmado', 'con_problemas'].includes(tracking.estado);
  const vuelta = await calculateRoute(origin, destination);
  const ida = moved ? { duracion_min: 0, distancia_km: 0, geometria: null } : await calculateRoute(destination, origin);
  const condition = tracking?.hitos?.slice().reverse().find(h => h.condicion_declarada && h.condicion_declarada !== 'sin_verificar')?.condicion_declarada;
  const evaluation = evaluateLogistics(donation, { ida, vuelta }, { demora_trafico_min: traffic, dispone_cadena_frio: cold, fecha_propuesta: tracking?.fecha_propuesta, etapa: tracking?.estado, condicion: condition, incidencias_abiertas: tracking?.incidencias_abiertas, incidencias_criticas: tracking?.incidencias_criticas });
  const evaluationId = await transaction(async client => {
    const created = await client.query(`INSERT INTO evaluaciones_ruta (id_donacion, id_organizacion, id_solicitud, origen_latitud, origen_longitud, destino_latitud, destino_longitud, distancia_km, duracion_estimada_min, tiempo_preparacion_min, tiempo_recojo_min, tiempo_entrega_min, tiempo_total_estimado_min, tiempo_disponible_min, margen_tiempo_min, semaforo, proveedor_mapa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [donation.id_donacion, organizationId, requestId, origin.latitud, origin.longitud, destination.latitud, destination.longitud, vuelta.distancia_km, vuelta.duracion_min, evaluation.espera_min, ida.duracion_min + evaluation.recojo_min, traffic, evaluation.tiempo_total_min, evaluation.tiempo_disponible_min, evaluation.margen_min, evaluation.color, vuelta.proveedor]);
    await audit(client, req.user.id_usuario, 'evaluaciones_ruta', created.insertId, 'calcular', { viaje_al_recojo_min: ida.duracion_min, tiempo_recojo_min: evaluation.recojo_min, trafico_adicional_min: traffic, trafico_en_vivo: false, id_seguimiento: tracking?.id_seguimiento || null });
    return created.insertId;
  });
  return { id_evaluacion: evaluationId, origen: origin, destino: destination, ida, vuelta, evaluacion: evaluation };
}

export function createLogisticsRouter() {
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
  router.post('/donaciones/:id/evaluacion-ruta', requireAuth, requireRole('organizacion'), async (req, res) => {
    requireVerified(req);
    const row = (await db.query(`SELECT d.*, dt.estado_verificacion, u.estado AS usuario_estado FROM donaciones d JOIN donantes dt ON dt.id_donante = d.id_donante JOIN usuarios u ON u.id_usuario = dt.id_usuario WHERE d.id_donacion = ?`, [id(req.params.id)])).rows[0];
    if (!row || row.borrador || row.estado !== 'disponible' || row.estado_verificacion !== 'verificado' || !canSignIn(row.usuario_estado) || Date.parse(row.fecha_limite_recojo) <= Date.now() || (row.fecha_limite_aprovechamiento && Date.parse(row.fecha_limite_aprovechamiento) <= Date.now()) || (row.fecha_vencimiento && Date.parse(row.fecha_vencimiento) <= Date.now())) throw error(404, 'DONATION_UNAVAILABLE', 'La donación ya no está disponible.');
    const org = req.user.perfil;
    const origin = { nombre: 'Lugar de recojo', direccion: row.direccion_recojo, latitud: row.latitud, longitud: row.longitud };
    const destination = { nombre: org.nombre, direccion: org.direccion, latitud: org.latitud, longitud: org.longitud };
    res.json({ data: await plan(req, { donation: donationFromRow(row), origin, destination, organizationId: org.id_organizacion }) });
  });
  router.post('/seguimiento/:id/evaluacion-ruta', requireAuth, async (req, res) => {
    const tracking = await getTracking(req.user, id(req.params.id));
    if (['confirmado', 'con_problemas'].includes(tracking.estado) || tracking.solicitud_estado !== 'aceptada') throw error(409, 'TRACKING_CLOSED', 'Este recojo ya terminó o fue cancelado.');
    res.json({ data: await plan(req, { donation: tracking.donacion, origin: tracking.origen, destination: tracking.destino, organizationId: tracking.id_organizacion, requestId: tracking.id_solicitud, tracking }) });
  });
  return router;
}
