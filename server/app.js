import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { authRouter, loadSession, checkOrigin, csrf, requireAuth, requireRole } from './auth.js';
import { businessRouter, getStats } from './business.js';
import { errorHandler } from './errors.js';
import { createLogisticsRouter } from './logistics.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export { pool };
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null
      }
    },
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => { if (!req.body) req.body = {}; next(); });
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', checkOrigin);
  app.get('/api/health', async (req, res) => {
    try {
      const row = (await pool.query('SELECT current_database() AS database,now() AS server_time')).rows[0];
      res.json({ data: { status: 'ok', postgres: true, database: row.database, server_time: row.server_time, timezone: 'America/Lima' } });
    } catch { res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'No se pudo conectar con PostgreSQL.' } }); }
  });
  app.get('/api/public/stats', async (req, res) => res.json({ data: await getStats() }));
  app.use('/api', loadSession, csrf);
  app.use('/api/auth', authRouter);
  app.use('/api', createLogisticsRouter({ pool, requireAuth, requireRole, csrf }));
  app.use('/api', businessRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No existe este recurso de la API.' } }));

  const pages = { donante: 'donante.html', organizacion: 'organizacion.html', administrador: 'administrador.html' };
  for (const [role, name] of Object.entries(pages)) {
    app.get(`/${name}`, loadSession, (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!req.user) return res.redirect('/login.html');
      if (req.user.rol !== role) return res.status(403).type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>Acceso restringido</title><h1>Acceso restringido</h1><p>Su rol no puede consultar este panel.</p><a href="/">Volver al inicio</a></html>');
      res.sendFile(path.join(root, name));
    });
  }
  app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
  for (const name of ['index.html', 'login.html', 'registro.html']) app.get(`/${name}`, (req, res) => res.sendFile(path.join(root, name)));
  for (const directory of ['assets', 'css', 'js']) app.use(`/${directory}`, express.static(path.join(root, directory), { dotfiles: 'deny', index: false }));
  app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules/leaflet/dist'), { dotfiles: 'deny', index: false }));
  app.use((req, res) => res.status(404).type('text').send('No se encontró esta página.'));
  app.use(errorHandler);
  return app;
}
