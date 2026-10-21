import { Router } from 'express';
import { pool, transaction, audit } from './db.js';
import { requireAuth, requireRole, requireVerified, userFromRow } from './auth.js';
import { fail } from './errors.js';
import { id, text, optionalText, date, donationInput, profileInput, bool } from './validation.js';

export async function expireDonations() {
  return transaction(async client => {
    const expired = (await client.query(`UPDATE donacion SET estado='vencida',fecha_actualizacion=now()
      WHERE estado='disponible' AND (fecha_limite_recojo<=now() OR fecha_limite_aprovechamiento_declarada<=now())
      RETURNING id_donacion`)).rows;
    for (const row of expired) {
      const rejected = (await client.query(`UPDATE solicitud SET estado='rechazada',motivo_decision='La ventana de recojo de la donación venció.',fecha_actualizacion=now()
        WHERE id_donacion=$1 AND estado='pendiente' RETURNING id_solicitud`, [row.id_donacion])).rows;
      for (const request of rejected) await audit(client, null, 'solicitud', request.id_solicitud, 'rechazar_por_vencimiento', { id_donacion: row.id_donacion });
      await audit(client, null, 'donacion', row.id_donacion, 'vencer', { motivo: 'Se alcanzó una fecha límite declarada.' });
    }
    return expired.length;
  });
}

const donationSelect = `SELECT d.*,dt.nombre_establecimiento AS donante_nombre,dt.id_usuario AS donante_id_usuario,
  dt.estado_verificacion AS donante_estado_verificacion,u.estado AS donante_estado,
  jsonb_build_object('id_donante',dt.id_donante,'nombre_establecimiento',dt.nombre_establecimiento,'direccion',dt.direccion,
  'distrito',dt.distrito,'latitud',dt.latitud,'longitud',dt.longitud,'es_demostracion',u.es_demostracion) AS donante,
  (SELECT count(*)::int FROM solicitud s WHERE s.id_donacion=d.id_donacion) AS solicitudes_count
  FROM donacion d JOIN donante dt USING(id_donante) JOIN usuario u ON u.id_usuario=dt.id_usuario`;
const requestSelect = `SELECT s.*,d.alimento,d.cantidad,d.unidad,d.estado AS donacion_estado,
  dt.nombre_establecimiento AS donante_nombre,o.nombre AS organizacion_nombre,
  to_jsonb(d) AS donacion,to_jsonb(o) AS organizacion,to_jsonb(dt) AS donante,
  (SELECT to_jsonb(e) FROM evaluacion_ruta e WHERE e.id_solicitud=s.id_solicitud ORDER BY e.fecha_calculo DESC LIMIT 1) AS evaluacion_ruta
  FROM solicitud s JOIN donacion d USING(id_donacion) JOIN donante dt USING(id_donante)
  JOIN organizacion o USING(id_organizacion)`;

function donationOwner(req, donation) {
  if (req.user.rol !== 'donante' || req.user.perfil?.id_donante !== donation.id_donante)
    fail(403, 'NOT_OWNER', 'Solo el donante propietario puede modificar esta donación.');
}
async function lockedDonation(client, donationId) {
  const row = (await client.query('SELECT * FROM donacion WHERE id_donacion=$1 FOR UPDATE', [donationId])).rows[0];
  if (!row) fail(404, 'DONATION_NOT_FOUND', 'No se encontró la donación.');
  return row;
}
function checkAvailable(donation) {
  if (donation.estado !== 'disponible' || Date.parse(donation.fecha_limite_recojo) <= Date.now() ||
      (donation.fecha_limite_aprovechamiento_declarada && Date.parse(donation.fecha_limite_aprovechamiento_declarada) <= Date.now()))
    fail(409, 'DONATION_UNAVAILABLE', 'La donación ya no está disponible para nuevas solicitudes o decisiones.');
}

export const businessRouter = Router();
businessRouter.use(requireAuth);
businessRouter.get('/donaciones', async (req, res) => {
  await expireDonations();
  const conditions = [], params = [];
  const add = (sql, value) => { params.push(value); conditions.push(sql.replace('?', `$${params.length}`)); };
  if (req.user.rol === 'donante') add('d.id_donante=?', req.user.perfil?.id_donante || -1);
  else if (req.user.rol === 'organizacion') {
    conditions.push("d.estado='disponible' AND d.fecha_limite_recojo>now() AND dt.estado_verificacion='verificado' AND u.estado='activo'");
  }
  if (req.query.q) add("(d.alimento || ' ' || d.descripcion || ' ' || dt.nombre_establecimiento) ILIKE ?", `%${String(req.query.q).slice(0, 150)}%`);
  if (req.query.categoria) add('d.categoria=?', String(req.query.categoria));
  if (req.query.distrito) add('d.distrito ILIKE ?', String(req.query.distrito));
  if (req.query.estado) add('d.estado=?', String(req.query.estado));
  const result = await pool.query(`${donationSelect} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY d.fecha_creacion DESC,d.id_donacion DESC LIMIT 200`, params);
  res.json({ data: result.rows });
});

businessRouter.get('/donaciones/:id', async (req, res) => {
  await expireDonations();
  const row = (await pool.query(`${donationSelect} WHERE d.id_donacion=$1`, [id(req.params.id)])).rows[0];
  if (!row) fail(404, 'DONATION_NOT_FOUND', 'No se encontró la donación.');
  if (req.user.rol === 'donante' && row.id_donante !== req.user.perfil?.id_donante) fail(403, 'NOT_OWNER', 'No tiene permiso para consultar esta donación.');
  if (req.user.rol === 'organizacion' && (row.estado !== 'disponible' || row.donante_estado_verificacion !== 'verificado' || row.donante_estado !== 'activo')) {
    const own = await pool.query('SELECT 1 FROM solicitud WHERE id_donacion=$1 AND id_organizacion=$2', [row.id_donacion, req.user.perfil?.id_organizacion || -1]);
    if (!own.rowCount) fail(403, 'FORBIDDEN', 'La donación no está disponible en el catálogo.');
  }
  if (req.user.rol === 'donante' || req.user.rol === 'administrador') row.solicitudes = (await pool.query(`${requestSelect} WHERE s.id_donacion=$1 ORDER BY s.fecha_creacion DESC`, [row.id_donacion])).rows;
  else row.solicitudes = (await pool.query(`${requestSelect} WHERE s.id_donacion=$1 AND s.id_organizacion=$2 ORDER BY s.fecha_creacion DESC`, [row.id_donacion, req.user.perfil?.id_organizacion || -1])).rows;
  res.json({ data: row });
});

businessRouter.post('/donaciones', requireRole('donante'), async (req, res) => {
  requireVerified(req);
  const value = donationInput(req.body);
  const entries = Object.entries(value);
  const row = await transaction(async client => {
    const created = (await client.query(`INSERT INTO donacion(id_donante,${entries.map(([key]) => key).join(',')})
      VALUES($1,${entries.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`, [req.user.perfil.id_donante, ...entries.map(([, value]) => value)])).rows[0];
    await audit(client, req.user.id_usuario, 'donacion', created.id_donacion, 'crear', { alimento: created.alimento });
    return created;
  });
  res.status(201).json({ data: row });
});
businessRouter.patch('/donaciones/:id', requireRole('donante'), async (req, res) => {
  requireVerified(req);
  await expireDonations();
  const row = await transaction(async client => {
    const existing = await lockedDonation(client, id(req.params.id));
    donationOwner(req, existing);
    checkAvailable(existing);
    if ((await client.query("SELECT 1 FROM solicitud WHERE id_donacion=$1 AND estado IN ('pendiente','aceptada')", [existing.id_donacion])).rowCount)
      fail(409, 'DONATION_HAS_REQUESTS', 'No se puede editar una donación con solicitudes activas. Cancele la publicación con un motivo si las condiciones cambiaron.');
    const value = donationInput({ ...existing, ...req.body });
    const entries = Object.entries(value);
    const result = (await client.query(`UPDATE donacion SET ${entries.map(([key], i) => `${key}=$${i + 1}`).join(',')},fecha_actualizacion=now()
      WHERE id_donacion=$${entries.length + 1} RETURNING *`, [...entries.map(([, value]) => value), existing.id_donacion])).rows[0];
    await audit(client, req.user.id_usuario, 'donacion', existing.id_donacion, 'editar', { campos: Object.keys(req.body) });
    return result;
  });
  res.json({ data: row });
});
businessRouter.post('/donaciones/:id/cancelar', requireRole('donante'), async (req, res) => {
  const motivo = text(req.body.motivo, 'motivo de cancelación', 5, 1000);
  await expireDonations();
  const row = await transaction(async client => {
    const existing = await lockedDonation(client, id(req.params.id));
    donationOwner(req, existing);
    if (!['disponible', 'en_proceso'].includes(existing.estado)) fail(409, 'INVALID_STATE', 'La donación ya está cancelada o vencida.');
    const canceled = (await client.query("UPDATE donacion SET estado='cancelada',motivo_cancelacion=$2,fecha_actualizacion=now() WHERE id_donacion=$1 RETURNING *", [existing.id_donacion, motivo])).rows[0];
    const affected = (await client.query(`UPDATE solicitud SET estado='cancelada',motivo_decision=$2,fecha_actualizacion=now()
      WHERE id_donacion=$1 AND estado IN ('pendiente','aceptada') RETURNING id_solicitud`, [existing.id_donacion, `Donante canceló la donación: ${motivo}`])).rows;
    for (const request of affected) await audit(client, req.user.id_usuario, 'solicitud', request.id_solicitud, 'cancelar_por_donacion', { motivo });
    await audit(client, req.user.id_usuario, 'donacion', existing.id_donacion, 'cancelar', { motivo });
    return canceled;
  });
  res.json({ data: row });
});

businessRouter.get('/solicitudes', async (req, res) => {
  await expireDonations();
  const params = [], conditions = [];
  if (req.user.rol === 'donante') { params.push(req.user.perfil?.id_donante || -1); conditions.push('d.id_donante=$1'); }
  else if (req.user.rol === 'organizacion') { params.push(req.user.perfil?.id_organizacion || -1); conditions.push('s.id_organizacion=$1'); }
  if (req.query.id_donacion) { params.push(id(req.query.id_donacion)); conditions.push(`s.id_donacion=$${params.length}`); }
  if (req.query.estado) { params.push(String(req.query.estado)); conditions.push(`s.estado=$${params.length}`); }
  res.json({ data: (await pool.query(`${requestSelect} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY s.fecha_creacion DESC,s.id_solicitud DESC LIMIT 200`, params)).rows });
});
businessRouter.post('/donaciones/:id/solicitudes', requireRole('organizacion'), async (req, res) => {
  requireVerified(req);
  const value = {
    responsable_recojo: text(req.body.responsable_recojo, 'responsable de recojo', 2, 160),
    telefono: text(req.body.telefono, 'teléfono', 6, 40),
    transporte_declarado: text(req.body.transporte_declarado, 'transporte declarado', 2, 300),
    recipiente_declarado: text(req.body.recipiente_declarado, 'recipiente declarado', 2, 300),
    dispone_cadena_frio: bool(req.body.dispone_cadena_frio ?? false, 'dispone_cadena_frio'),
    fecha_propuesta: date(req.body.fecha_propuesta, 'fecha propuesta'),
    observaciones: optionalText(req.body.observaciones, 'observaciones')
  };
  await expireDonations();
  const row = await transaction(async client => {
    const donation = await lockedDonation(client, id(req.params.id));
    checkAvailable(donation);
    const verifiedDonor = await client.query("SELECT 1 FROM donante d JOIN usuario u USING(id_usuario) WHERE d.id_donante=$1 AND d.estado_verificacion='verificado' AND u.estado='activo'", [donation.id_donante]);
    if (!verifiedDonor.rowCount) fail(409, 'DONOR_UNAVAILABLE', 'El perfil donante no está habilitado para recibir solicitudes.');
    const proposed = Date.parse(value.fecha_propuesta);
    if (proposed < Date.now() || proposed < Date.parse(donation.fecha_disponibilidad) || proposed > Date.parse(donation.fecha_limite_recojo))
      fail(422, 'INVALID_PICKUP_TIME', 'La fecha propuesta debe estar en el futuro y dentro de la ventana de disponibilidad y recojo.');
    const entries = Object.entries(value);
    const created = (await client.query(`INSERT INTO solicitud(id_donacion,id_organizacion,${entries.map(([key]) => key).join(',')})
      VALUES($1,$2,${entries.map((_, i) => `$${i + 3}`).join(',')}) RETURNING *`, [donation.id_donacion, req.user.perfil.id_organizacion, ...entries.map(([, value]) => value)])).rows[0];
    await audit(client, req.user.id_usuario, 'solicitud', created.id_solicitud, 'crear', { id_donacion: donation.id_donacion, cadena_frio_declarada: value.dispone_cadena_frio });
    return created;
  });
  res.status(201).json({ data: row });
});

for (const action of ['aceptar', 'rechazar', 'cancelar']) {
  businessRouter.post(`/solicitudes/:id/${action}`, requireRole(action === 'cancelar' ? 'organizacion' : 'donante'), async (req, res) => {
    const requestId = id(req.params.id);
    const motivo = action === 'aceptar' ? optionalText(req.body.motivo, 'motivo', 1000) : text(req.body.motivo, 'motivo', 5, 1000);
    await expireDonations();
    const row = await transaction(async client => {
      const reference = (await client.query('SELECT id_donacion FROM solicitud WHERE id_solicitud=$1', [requestId])).rows[0];
      if (!reference) fail(404, 'REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
      // Todas las decisiones bloquean primero la misma donación. La segunda aceptación espera y ve el estado actualizado.
      const donation = await lockedDonation(client, reference.id_donacion);
      const request = (await client.query('SELECT * FROM solicitud WHERE id_solicitud=$1 FOR UPDATE', [requestId])).rows[0];
      if (action === 'cancelar') {
        if (request.id_organizacion !== req.user.perfil?.id_organizacion) fail(403, 'NOT_OWNER', 'Solo la organización solicitante puede cancelar su solicitud.');
      } else donationOwner(req, donation);
      if (request.estado !== 'pendiente') fail(409, 'INVALID_STATE', 'Solo se pueden modificar solicitudes pendientes.');
      if (action !== 'cancelar') checkAvailable(donation);
      const nextState = { aceptar: 'aceptada', rechazar: 'rechazada', cancelar: 'cancelada' }[action];
      const updated = (await client.query('UPDATE solicitud SET estado=$2,motivo_decision=$3,fecha_actualizacion=now() WHERE id_solicitud=$1 RETURNING *', [requestId, nextState, motivo || null])).rows[0];
      if (action === 'aceptar') {
        const rejected = (await client.query(`UPDATE solicitud SET estado='rechazada',motivo_decision='Otra solicitud fue seleccionada.',fecha_actualizacion=now()
          WHERE id_donacion=$1 AND id_solicitud<>$2 AND estado='pendiente' RETURNING id_solicitud`, [donation.id_donacion, requestId])).rows;
        for (const other of rejected) await audit(client, req.user.id_usuario, 'solicitud', other.id_solicitud, 'rechazar_no_seleccionada', { id_solicitud_aceptada: requestId });
        await client.query("UPDATE donacion SET estado='en_proceso',fecha_actualizacion=now() WHERE id_donacion=$1", [donation.id_donacion]);
        await audit(client, req.user.id_usuario, 'donacion', donation.id_donacion, 'iniciar_proceso', { id_solicitud: requestId });
      }
      await audit(client, req.user.id_usuario, 'solicitud', requestId, action, { motivo: motivo || null, id_donacion: donation.id_donacion });
      return updated;
    });
    res.json({ data: row });
  });
}

businessRouter.get('/perfil', (req, res) => res.json({ data: { usuario: { id_usuario: req.user.id_usuario, nombre: req.user.nombre, correo: req.user.correo, telefono: req.user.telefono, rol: req.user.rol }, perfil: req.user.perfil } }));
businessRouter.patch('/perfil', async (req, res) => {
  const nombre = text(req.body.nombre ?? req.user.nombre, 'nombre', 2, 160);
  const telefono = text(req.body.telefono ?? req.user.telefono, 'teléfono', 6, 40);
  const result = await transaction(async client => {
    let changedLocation = false;
    if (req.user.rol !== 'administrador') {
      const current = req.user.perfil;
      const next = profileInput({ ...req.body, perfil: { ...current, ...(req.body.perfil || req.body) } }, req.user.rol);
      changedLocation = ['direccion', 'distrito', 'latitud', 'longitud'].some(key => String(current[key]) !== String(next[key]));
      const entries = Object.entries(next);
      await client.query(`UPDATE ${req.user.rol} SET ${entries.map(([key], i) => `${key}=$${i + 1}`).join(',')}
        WHERE id_usuario=$${entries.length + 1}`, [...entries.map(([, value]) => value), req.user.id_usuario]);
    }
    const row = (await client.query('UPDATE usuario SET nombre=$2,telefono=$3 WHERE id_usuario=$1 RETURNING *', [req.user.id_usuario, nombre, telefono])).rows[0];
    await audit(client, req.user.id_usuario, 'usuario', req.user.id_usuario, 'editar_perfil', { ubicacion_actualizada: changedLocation });
    const user = await userFromRow(row, client);
    return { usuario: { id_usuario: user.id_usuario, nombre: user.nombre, correo: user.correo, telefono: user.telefono, rol: user.rol }, perfil: user.perfil };
  });
  res.json({ data: result });
});
businessRouter.get('/auditoria', async (req, res) => {
  const conditions = [], params = [];
  if (req.user.rol !== 'administrador') {
    params.push(req.user.id_usuario);
    if (req.user.rol === 'donante') {
      params.push(req.user.perfil?.id_donante || -1);
      conditions.push(`(a.id_usuario=$1 OR (a.entidad='donacion' AND a.id_entidad IN (SELECT id_donacion FROM donacion WHERE id_donante=$2))
        OR (a.entidad='solicitud' AND a.id_entidad IN (SELECT s.id_solicitud FROM solicitud s JOIN donacion d USING(id_donacion) WHERE d.id_donante=$2)))`);
    } else {
      params.push(req.user.perfil?.id_organizacion || -1);
      conditions.push(`(a.id_usuario=$1 OR (a.entidad='solicitud' AND a.id_entidad IN (SELECT id_solicitud FROM solicitud WHERE id_organizacion=$2)))`);
    }
  }
  if (req.query.entidad) { params.push(String(req.query.entidad)); conditions.push(`a.entidad=$${params.length}`); }
  if (req.query.id_entidad) { params.push(id(req.query.id_entidad)); conditions.push(`a.id_entidad=$${params.length}`); }
  res.json({ data: (await pool.query(`SELECT a.*,u.nombre AS usuario_nombre FROM auditoria a LEFT JOIN usuario u USING(id_usuario)
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY a.fecha_evento DESC,a.id_evento DESC LIMIT 200`, params)).rows });
});

export async function getStats() {
  await expireDonations();
  return (await pool.query(`SELECT
    (SELECT count(*)::int FROM usuario) AS usuarios,
    (SELECT count(*)::int FROM donante) AS donantes,
    (SELECT count(*)::int FROM organizacion) AS organizaciones,
    (SELECT count(*)::int FROM donacion) AS donaciones,
    (SELECT count(*)::int FROM donacion WHERE estado='disponible') AS disponibles,
    (SELECT count(*)::int FROM donacion WHERE estado='en_proceso') AS en_proceso,
    (SELECT count(*)::int FROM solicitud) AS solicitudes,
    (SELECT count(*)::int FROM solicitud WHERE estado='pendiente') AS solicitudes_pendientes,
    (SELECT count(*)::int FROM evaluacion_ruta) AS evaluaciones_logisticas,
    (SELECT count(*)::int FROM usuario WHERE es_demostracion) AS cuentas_demostracion`)).rows[0];
}
businessRouter.get('/admin/stats', requireRole('administrador'), async (req, res) => res.json({ data: await getStats() }));
