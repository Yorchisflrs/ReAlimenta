// Avisos dentro del sistema (tabla notificaciones). Se crean en la misma transacción que el cambio que
// los origina, así nunca se avisa de algo que no llegó a guardarse.
import { Router } from 'express';
import { db } from './db.js';
import { requireAuth } from './auth.js';
import { fail } from './errors.js';
import { id } from './validation.js';

export async function notify(client, userIds, { titulo, mensaje, tipo, id_donacion = null, id_solicitud = null }) {
  const recipients = [...new Set([userIds].flat().filter(value => Number.isSafeInteger(value) && value > 0))];
  for (const userId of recipients)
    await client.query('INSERT INTO notificaciones (id_usuario, id_donacion, id_solicitud, titulo, mensaje, tipo) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, id_donacion, id_solicitud, String(titulo).slice(0, 200), String(mensaje), String(tipo || 'aviso').slice(0, 100)]);
}

// Usuario dueño de un perfil de donante o de beneficiaria.
export const donorUser = async (client, donorId) => (await client.query('SELECT id_usuario FROM donantes WHERE id_donante = ?', [donorId])).rows[0]?.id_usuario;
export const organizationUser = async (client, organizationId) => (await client.query('SELECT id_usuario FROM organizaciones WHERE id_organizacion = ?', [organizationId])).rows[0]?.id_usuario;

const fromRow = row => ({
  id_notificacion: row.id_notificacion, titulo: row.titulo, mensaje: row.mensaje, tipo: row.tipo,
  leida: row.leida === true || row.leida === 1, fecha: row.fecha_creacion, id_donacion: row.id_donacion, id_solicitud: row.id_solicitud
});

export const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.get('/notificaciones/resumen', async (req, res) => {
  const row = (await db.query('SELECT COUNT(*) AS total, SUM(leida = 0) AS no_leidas, MAX(id_notificacion) AS ultima FROM notificaciones WHERE id_usuario = ?', [req.user.id_usuario])).rows[0];
  res.json({ data: { no_leidas: Number(row.no_leidas || 0), ultima: Number(row.ultima || 0) } });
});
notificationRouter.get('/notificaciones', async (req, res) => {
  const rows = (await db.query('SELECT * FROM notificaciones WHERE id_usuario = ? ORDER BY id_notificacion DESC LIMIT 100', [req.user.id_usuario])).rows;
  res.json({ data: rows.map(fromRow), no_leidas: rows.filter(row => !(row.leida === true || row.leida === 1)).length });
});
notificationRouter.post('/notificaciones/leidas', async (req, res) => {
  await db.query('UPDATE notificaciones SET leida = 1 WHERE id_usuario = ? AND leida = 0', [req.user.id_usuario]);
  res.json({ data: { no_leidas: 0 } });
});
notificationRouter.post('/notificaciones/:id/leida', async (req, res) => {
  const result = await db.query('UPDATE notificaciones SET leida = 1 WHERE id_notificacion = ? AND id_usuario = ?', [id(req.params.id), req.user.id_usuario]);
  if (!result.rowCount) {
    // rowCount es 0 tanto si no existe como si ya estaba leída: solo es error si no es suya.
    const own = (await db.query('SELECT 1 FROM notificaciones WHERE id_notificacion = ? AND id_usuario = ?', [id(req.params.id), req.user.id_usuario])).rowCount;
    if (!own) fail(404, 'NOTIFICATION_NOT_FOUND', 'No se encontró la notificación.');
  }
  res.json({ data: { id_notificacion: id(req.params.id), leida: true } });
});
