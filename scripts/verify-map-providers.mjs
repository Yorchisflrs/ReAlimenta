import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { geocode } from '../server/logistics.js';

// Comprueba la búsqueda de direcciones (Nominatim). El sistema ya no calcula rutas.
const evidence = { fecha: new Date().toISOString(), consultas: [] };
for (const query of ['Catedral de Puno, Puno, Perú', 'Parque Pino, Puno, Perú']) {
  try { evidence.consultas.push({ query, resultados: await geocode(query) }); }
  catch (err) { evidence.consultas.push({ query, error: err.message }); }
}
await mkdir('docs/evidencias', { recursive: true });
await writeFile('docs/evidencias/proveedores-reales.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ consultas: evidence.consultas.map(x => ({ query: x.query, resultado: x.resultados?.[0] || x.error })) }, null, 2));
