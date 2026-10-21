import { createApp } from './app.js';
import { pool } from './db.js';
import { expireDonations } from './business.js';
import { config } from './config.js';

if (!config.databaseUrl) {
  console.error('Falta DATABASE_URL. Configure .env siguiendo .env.example.');
  process.exit(1);
}
try {
  await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
  await expireDonations();
  const server = createApp().listen(config.port, config.host, () => console.log(`REAlimenta disponible en ${config.origin} (PostgreSQL real, America/Lima).`));
  const timer = setInterval(() => expireDonations().catch(error => console.error('No se pudo actualizar vencimientos:', error.message)), 60000);
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
  console.error('No se pudo iniciar REAlimenta:', error.message, '\nEjecute npm run db:start, npm run db:migrate y npm run db:seed.');
  await pool.end();
  process.exitCode = 1;
}
