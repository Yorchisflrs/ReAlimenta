import { db, pool } from '../server/db.js';
import { config } from '../server/config.js';
import { inspectSchema, REQUIRED_SCHEMA } from '../server/schema.js';

// Prueba de conexión y verificación de la estructura existente en modo solo lectura.
// No crea, altera ni elimina tablas o registros, y nunca muestra la contraseña.
const hints = {
  ECONNREFUSED: 'MySQL no responde en el host y puerto configurados. Inícielo desde el Panel de Control de XAMPP.',
  ER_ACCESS_DENIED_ERROR: 'Usuario o contraseña rechazados. Revise DB_USER y DB_PASSWORD en .env (la contraseña de root en XAMPP está vacía por defecto).',
  ER_BAD_DB_ERROR: `No existe la base "${config.database.name}". Revise DB_NAME en .env o créela desde phpMyAdmin.`,
  ETIMEDOUT: 'Se agotó el tiempo de conexión. Revise DB_HOST y DB_PORT en .env.'
};
try {
  const schema = await inspectSchema(db);
  console.log('Conexión a MySQL establecida correctamente');
  console.log(`Base de datos: ${config.database.name} · tablas verificadas: ${schema.tablasEncontradas}/${schema.tablasEsperadas}`);
  if (!schema.ok) {
    if (schema.tablasFaltantes.length) console.error('Tablas faltantes:', schema.tablasFaltantes.join(', '));
    for (const [table, columns] of Object.entries(schema.columnasFaltantes)) console.error(`Columnas faltantes en ${table}:`, columns.join(', '));
    console.error('La aplicación no modifica la estructura: corrija las tablas en phpMyAdmin si es necesario.');
    process.exitCode = 1;
  } else {
    for (const table of Object.keys(REQUIRED_SCHEMA)) {
      const { total } = (await db.query(`SELECT COUNT(*) AS total FROM ${table}`)).rows[0];
      console.log(`  ${table.padEnd(18)} ${String(total).padStart(6)} registros`);
    }
  }
} catch (error) {
  console.error(`No se pudo establecer la conexión con MySQL [${error.code || 'ERROR'}].`);
  console.error(hints[error.code] || 'Revise que MySQL esté iniciado en XAMPP y la configuración DB_* de .env.');
  process.exitCode = 1;
} finally { await pool.end(); }
