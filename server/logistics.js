import { Router } from 'express';

// Búsqueda de direcciones con Nominatim (OpenStreetMap). El sistema ya no calcula rutas ni tiempos de
// viaje: la beneficiaria declara cuánto tardará en llegar y el mapa solo muestra los puntos.
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
  return router;
}
