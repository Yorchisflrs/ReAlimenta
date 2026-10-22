import { createApp } from './app.js';
import { db, pool } from './db.js';
import { inspectSchema } from './schema.js';
import { expireDonations } from './business.js';
import { config } from './config.js';

try {
  const schema = await inspectSchema(db);
  if (!schema.ok) {
    console.error('La base MySQL no tiene la estructura que usa REAlimenta. No se modificó ninguna tabla.');
    if (schema.tablasFaltantes.length) console.error('Tablas faltantes:', schema.tablasFaltantes.join(', '));
    for (const [table, columns] of Object.entries(schema.columnasFaltantes)) console.error(`Columnas faltantes en ${table}:`, columns.join(', '));
    await pool.end();
    process.exit(1);
  }
  console.log(`Conexión a MySQL establecida correctamente (base ${config.database.name}, ${schema.tablasEncontradas} tablas verificadas).`);
  await expireDonations();
  const server = createApp().listen(config.port, config.host, () => console.log(`REAlimenta disponible en ${config.origin} (MySQL de XAMPP, America/Lima).`));
  const timer = setInterval(() => expireDonations().catch(error => console.error('No se pudo actualizar vencimientos:', error.code || error.message)), 60000);
  timer.unref();
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    server.close(async () => { await pool.end(); process.exit(0); });
  }
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
} catch (error) {
  // Registro técnico (código y mensaje del controlador); nunca se imprime la contraseña.
  console.error('No se pudo iniciar REAlimenta: no hay conexión con MySQL.', `[${error.code || 'ERROR'}] ${error.message}`);
  console.error('Inicie MySQL desde el Panel de Control de XAMPP y revise DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD en .env.');
  await pool.end().catch(() => {});
  process.exitCode = 1;
}
