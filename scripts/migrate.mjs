import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/db.js';

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (nombre text PRIMARY KEY,fecha timestamptz NOT NULL DEFAULT now())`);
  const directory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
  for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(72409901)');
      if (!(await client.query('SELECT 1 FROM schema_migrations WHERE nombre=$1', [name])).rowCount) {
        await client.query(await readFile(`${directory}/${name}`, 'utf8'));
        await client.query('INSERT INTO schema_migrations(nombre) VALUES($1)', [name]);
        console.log(`Migración aplicada: ${name}`);
      } else console.log(`Migración ya aplicada: ${name}`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
} catch (error) { console.error('No se pudo migrar PostgreSQL:', error.message); process.exitCode = 1; }
finally { await pool.end(); }
