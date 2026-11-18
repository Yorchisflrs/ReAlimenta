// Listas que el administrador puede ampliar o reducir (tabla catalogos). Se guardan en memoria y se
// vuelven a leer después de cada cambio. Un valor desactivado ya no se ofrece, pero los registros que
// lo usan lo conservan.
import { db } from './db.js';
import { TIPOS_ORGANIZACION, TIPOS_ALIMENTO } from './puno.js';

export const CATALOG_TYPES = {
  tipo_organizacion: { nombre: 'Tipos de beneficiaria', defaults: TIPOS_ORGANIZACION },
  tipo_alimento: { nombre: 'Tipos de alimento', defaults: TIPOS_ALIMENTO }
};

let cache = null;
export async function loadCatalogs(client = db) {
  const rows = (await client.query('SELECT * FROM catalogos ORDER BY tipo, orden, id_catalogo')).rows;
  const next = {};
  for (const tipo of Object.keys(CATALOG_TYPES)) {
    const own = rows.filter(row => row.tipo === tipo);
    // Una base sin filas para un tipo usa la lista original del sistema.
    next[tipo] = own.length ? own.filter(row => row.activo === true || row.activo === 1).map(row => row.valor) : [...CATALOG_TYPES[tipo].defaults];
  }
  cache = next;
  return cache;
}
export async function ensureCatalogs() { if (!cache) await loadCatalogs(); }
export const invalidateCatalogs = () => { cache = null; };
export const activeValues = tipo => cache?.[tipo] ?? [...CATALOG_TYPES[tipo].defaults];
