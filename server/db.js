import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  options: '-c timezone=America/Lima'
});
pool.on('error', err => console.error('Conexión PostgreSQL interrumpida:', err.message));

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function audit(client, actor, entity, id, action, detail = {}) {
  await client.query(`INSERT INTO auditoria (id_usuario,entidad,id_entidad,accion,detalle)
    VALUES ($1,$2,$3,$4,$5::jsonb)`, [actor || null, entity, id, action, JSON.stringify(detail)]);
}
