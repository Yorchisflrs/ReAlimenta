import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './db.js';
import { config } from './config.js';
import { inspectSchema } from './schema.js';
import { authRouter, loadSession, checkOrigin, csrf, requireAuth, requireRole } from './auth.js';
import { businessRouter, getStats } from './business.js';
import { errorHandler } from './errors.js';
import { createLogisticsRouter } from './logistics.js';
import { custodyRouter } from './custody.js';
import { photoRouter,mediaRouter } from './photos.js';
import { recoveryRouter } from './recovery.js';
import { browserScript } from './puno.js';

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
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
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
      const row = (await db.query('SELECT DATABASE() AS base_de_datos, NOW() AS server_time')).rows[0];
      res.json({ data: { status: 'ok', mysql: true, ...(config.production ? {} : { database: row.base_de_datos }), server_time: row.server_time, timezone: 'America/Lima' } });
    } catch (error) {
      console.error('Prueba de salud MySQL fallida:', error.code || error.message);
      res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'No se pudo conectar con la base de datos MySQL.' } });
    }
  });
  // Prueba de conexión solo para desarrollo: no revela contraseña, usuario ni versión del servidor.
  if (!config.production) app.get('/api/dev/conexion', async (req, res) => {
    try {
      const schema = await inspectSchema(db);
      res.status(schema.ok ? 200 : 500).json({ data: {
        message: schema.ok ? 'Conexión a MySQL establecida correctamente' : 'Conexión a MySQL establecida, pero faltan tablas o columnas esperadas.',
        base_de_datos: config.database.name, tablas_esperadas: schema.tablasEsperadas, tablas_encontradas: schema.tablasEncontradas,
        tablas_faltantes: schema.tablasFaltantes, columnas_faltantes: schema.columnasFaltantes
      } });
    } catch (error) {
      console.error('Prueba de conexión MySQL fallida:', error.code || error.message);
      res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'No se pudo establecer la conexión con MySQL. Revise que MySQL esté iniciado en XAMPP y la configuración de .env.' } });
    }
  });
  app.get('/api/public/stats', async (req, res) => res.json({ data: await getStats() }));
  app.use('/api', loadSession, csrf);
  app.use('/api/auth', authRouter);
  app.use('/api/auth', recoveryRouter);
  app.use('/api', createLogisticsRouter({ db, requireAuth }));
  app.use('/api', photoRouter);
  app.use('/api', custodyRouter);
  app.use('/api', businessRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No existe este recurso de la API.' } }));
  app.use('/media/donaciones',loadSession,mediaRouter);

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
  for (const name of ['index.html', 'login.html', 'registro.html','recuperar.html']) app.get(`/${name}`, (req, res) => res.sendFile(path.join(root, name)));
  // Catálogo de provincias/distritos y patrones de validación, generado desde server/puno.js.
  app.get('/js/puno.js', (req, res) => res.type('application/javascript').send(browserScript()));
  for (const directory of ['assets', 'css', 'js']) app.use(`/${directory}`, express.static(path.join(root, directory), { dotfiles: 'deny', index: false }));
  app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules/leaflet/dist'), { dotfiles: 'deny', index: false }));
  // Generación del comprobante PDF en el navegador (la CSP solo admite scripts propios).
  app.get('/vendor/jspdf/jspdf.umd.min.js', (req, res) => res.sendFile(path.join(root, 'node_modules/jspdf/dist/jspdf.umd.min.js')));
  app.use((req, res) => res.status(404).type('text').send('No se encontró esta página.'));
  app.use(errorHandler);
  return app;
}
