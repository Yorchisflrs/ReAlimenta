import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { geocode, calculateRoute } from '../server/logistics.js';

const evidence = { fecha: new Date().toISOString(), consultas: [], ruta: null };
for (const query of ['Catedral de Puno, Puno, Perú', 'Parque Pino, Puno, Perú']) {
  try { evidence.consultas.push({ query, resultados: await geocode(query) }); }
  catch (err) { evidence.consultas.push({ query, error: err.message }); }
}
const origin = evidence.consultas[0]?.resultados?.[0];
const destination = evidence.consultas[1]?.resultados?.[0];
if (origin && destination) {
  try { evidence.ruta = await calculateRoute(origin, destination); }
  catch (err) { evidence.error_ruta = err.message; }
}
await mkdir('docs/evidencias', { recursive: true });
await writeFile('docs/evidencias/proveedores-reales.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ consultas: evidence.consultas.map(x => ({ query: x.query, resultado: x.resultados?.[0] || x.error })), ruta: evidence.ruta && { km: evidence.ruta.distancia_km, minutos: evidence.ruta.duracion_estimada_min, puntos: evidence.ruta.geometry?.coordinates?.length, proveedor: evidence.ruta.proveedor }, error_ruta: evidence.error_ruta }, null, 2));
