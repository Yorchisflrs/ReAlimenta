import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);

// Las credenciales viven solo en .env (excluido de Git y bloqueado para Apache mediante .htaccess).
export const config = {
  root,
  port,
  host: process.env.HOST || '127.0.0.1',
  origin: process.env.APP_ORIGIN || `http://127.0.0.1:${port}`,
  production: process.env.NODE_ENV === 'production',
  sessionHours: Math.min(24 * 7, Math.max(1, Number(process.env.SESSION_HOURS) || 8)),
  sessionSecret: process.env.SESSION_SECRET || '',
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'realimenta',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    connectionLimit: Math.min(50, Math.max(2, Number(process.env.DB_POOL_SIZE) || 10))
  },
  uploadsDir: path.resolve(root, process.env.UPLOADS_DIR || 'uploads/donaciones'),
  // Dominio reservado (RFC 2606) de las cuentas de demostración; reemplaza la marca es_demostracion.
  demoEmailDomain: String(process.env.DEMO_EMAIL_DOMAIN || 'realimenta.test').toLowerCase()
};
