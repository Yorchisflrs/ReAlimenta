import { Router } from 'express';
import { pool, transaction, audit } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { fail } from './errors.js';
import { id, text, optionalText, number, bool } from './validation.js';
import { calculateRoute, evaluateLogistics } from './logistics.js';

export async function createTracking(client, requestId, actor, demo = false) {
  const t = (await client.query(`INSERT INTO seguimiento(id_solicitud,custodio_actual,origen,destino)
    SELECT s.id_solicitud,dt.nombre_establecimiento,
    jsonb_build_object('nombre',dt.nombre_establecimiento,'direccion',d.direccion_recojo,'distrito',d.distrito,'latitud',d.latitud_recojo,'longitud',d.longitud_recojo),
    jsonb_build_object('nombre',o.nombre,'direccion',o.direccion,'distrito',o.distrito,'latitud',o.latitud,'longitud',o.longitud)
    FROM solicitud s JOIN donacion d USING(id_donacion) JOIN donante dt USING(id_donante) JOIN organizacion o USING(id_organizacion)
    WHERE s.id_solicitud=$1 AND s.estado='aceptada' ON CONFLICT(id_solicitud) DO NOTHING RETURNING *`, [requestId])).rows[0];
  if (t) {
    await client.query(`INSERT INTO hito_custodia(id_seguimiento,id_usuario,tipo,estado_resultante,lugar,observacion,es_demostracion)
      VALUES($1,$2,'aceptacion','preparacion',$3,'Solicitud aceptada. El alimento continúa bajo custodia del donante hasta registrar la transferencia.',$4)`, [t.id_seguimiento, actor, t.origen.direccion, demo]);
    await audit(client, actor, 'seguimiento', t.id_seguimiento, 'iniciar', { id_solicitud: requestId });
  }
  return t;
}

const selectTracking = `SELECT t.*,s.id_donacion,s.id_organizacion,s.estado AS solicitud_estado,s.fecha_propuesta,s.dispone_cadena_frio,s.responsable_recojo,s.transporte_declarado,
  d.id_donante,d.alimento,d.categoria,d.cantidad,d.unidad,d.imagen_clave,d.perfil_alimento,d.estado AS donacion_estado,
  d.fecha_limite_aprovechamiento_declarada,d.requiere_cadena_frio,d.conservacion_declarada,d.temperatura_declarada,d.envase,
  to_jsonb(d) AS donacion,
  (SELECT count(*)::int FROM incidencia i WHERE i.id_seguimiento=t.id_seguimiento AND i.estado='abierta') AS incidencias_abiertas,
  (SELECT count(*)::int FROM incidencia i WHERE i.id_seguimiento=t.id_seguimiento AND i.estado='abierta' AND i.severidad='alta') AS incidencias_criticas,
  (SELECT to_jsonb(h) FROM hito_custodia h WHERE h.id_seguimiento=t.id_seguimiento ORDER BY h.fecha_evento DESC,h.id_hito DESC LIMIT 1) AS ultimo_hito,
  (SELECT to_jsonb(e) FROM evaluacion_ruta e WHERE e.id_solicitud=s.id_solicitud ORDER BY e.fecha_calculo DESC,e.id_evaluacion DESC LIMIT 1) AS ultima_evaluacion
  FROM seguimiento t JOIN solicitud s USING(id_solicitud) JOIN donacion d USING(id_donacion)`;

function access(user, tracking) {
  if (user.rol === 'administrador') return;
  if (user.rol === 'donante' && user.perfil?.id_donante === tracking.id_donante) return;
  if (user.rol === 'organizacion' && user.perfil?.id_organizacion === tracking.id_organizacion) return;
  fail(403, 'TRACKING_FORBIDDEN', 'Solo los participantes y administración pueden consultar esta cadena de custodia.');
}
async function trackingFor(user, trackingId, client = pool, lock = false) {
  if (lock) await client.query('SELECT id_seguimiento FROM seguimiento WHERE id_seguimiento=$1 FOR UPDATE', [trackingId]);
  const t = (await client.query(`${selectTracking} WHERE t.id_seguimiento=$1`, [trackingId])).rows[0];
  if (!t) fail(404, 'TRACKING_NOT_FOUND', 'No se encontró el seguimiento.');
  access(user, t);
  return t;
}
function scope(user, alias = 'd', orgAlias = 's') {
  if (user.rol === 'administrador') return { sql: 'true', params: [] };
  return user.rol === 'donante'
    ? { sql: `${alias}.id_donante=$1`, params: [user.perfil?.id_donante || -1] }
    : { sql: `${orgAlias}.id_organizacion=$1`, params: [user.perfil?.id_organizacion || -1] };
}

export function trackingInputs(t, input = {}) {
  const progress = ['recogido','en_transito','entregado','confirmado'].includes(t.estado);
  return { ...input, fecha_propuesta: progress ? null : t.fecha_propuesta,
    dispone_cadena_frio: typeof input.dispone_cadena_frio === 'boolean' ? input.dispone_cadena_frio : (t.ultimo_hito?.conserva_frio ?? t.dispone_cadena_frio),
    etapa_custodia: t.estado, condicion_declarada: t.ultimo_hito?.condicion_declarada || 'sin_verificar',
    incidencias_criticas: t.incidencias_criticas, incidencias_abiertas: t.incidencias_abiertas };
}
export async function evaluateTracking(t, user, input = {}) {
  const route = await calculateRoute(t.origen, t.destino);
  const parameters = trackingInputs(t, input);
  const evaluation = evaluateLogistics(t.donacion, route, parameters);
  const detail = { ...evaluation, ruta: route, parametros: parameters };
  await pool.query(`INSERT INTO evaluacion_ruta(id_donacion,id_solicitud,id_usuario,id_organizacion,origen_latitud,origen_longitud,destino_latitud,destino_longitud,distancia_km,duracion_estimada_min,tiempo_total_estimado_min,margen_tiempo_min,estado_viabilidad,proveedor_ruta,detalle,geometria)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [t.id_donacion,t.id_solicitud,user.id_usuario,t.id_organizacion,t.origen.latitud,t.origen.longitud,t.destino.latitud,t.destino.longitud,route.distancia_km,route.duracion_estimada_min,evaluation.tiempo_total_estimado_min,evaluation.margen_tiempo_min,evaluation.estado_viabilidad,route.proveedor,JSON.stringify(detail),JSON.stringify(route.geometry)]);
  return { ruta: route, evaluacion: evaluation };
}

export const custodyRouter = Router();
custodyRouter.use(requireAuth);
custodyRouter.get('/seguimiento', async (req, res) => {
  const filter = scope(req.user);
  res.json({ data: (await pool.query(`${selectTracking} WHERE ${filter.sql} AND NOT d.ocultar_presentacion ORDER BY CASE WHEN t.estado='confirmado' THEN 1 ELSE 0 END,t.fecha_actualizacion DESC LIMIT 200`, filter.params)).rows });
});
custodyRouter.get('/seguimiento/:id', async (req, res) => {
  const t = await trackingFor(req.user, id(req.params.id));
  t.hitos = (await pool.query(`SELECT h.*,u.nombre AS actor_nombre,u.rol AS actor_rol FROM hito_custodia h JOIN usuario u USING(id_usuario) WHERE h.id_seguimiento=$1 ORDER BY h.fecha_evento,h.id_hito`, [t.id_seguimiento])).rows;
  t.incidencias = (await pool.query(`SELECT i.*,u.nombre AS actor_nombre,r.nombre AS resuelto_por FROM incidencia i JOIN usuario u ON u.id_usuario=i.id_usuario LEFT JOIN usuario r ON r.id_usuario=i.id_usuario_resuelve WHERE i.id_seguimiento=$1 ORDER BY i.fecha_creacion DESC`, [t.id_seguimiento])).rows;
  if(t.ultima_evaluacion?.detalle?.ruta){
    const route=t.ultima_evaluacion.detalle.ruta;
    t.plan_actual={ruta:route,evaluacion:evaluateLogistics(t.donacion,route,trackingInputs(t,{preparacion_min:10,recojo_min:10,entrega_min:5,margen_seguridad_min:15}))};
  }
  res.json({ data: t });
});
custodyRouter.post('/seguimiento/:id/evaluacion', async (req, res) => {
  const t = await trackingFor(req.user, id(req.params.id));
  res.json({ data: await evaluateTracking(t, req.user, req.body) });
});

const transitions = { preparacion: 'listo', listo: 'recogido', recogido: 'en_transito', en_transito: 'entregado', entregado: 'confirmado' };
const allowedRoles = { listo: ['donante','administrador'], recogido: ['donante','organizacion','administrador'], en_transito: ['organizacion','administrador'], entregado: ['organizacion','administrador'], confirmado: ['organizacion','administrador'], observacion: ['donante','organizacion','administrador'] };
custodyRouter.post('/seguimiento/:id/hitos', async (req, res) => {
  const type = text(req.body.tipo, 'tipo de hito', 3, 30);
  if (!allowedRoles[type]?.includes(req.user.rol)) fail(403, 'CUSTODY_ROLE', 'Su rol no puede registrar este hito de custodia.');
  const value = { responsable_entrega: optionalText(req.body.responsable_entrega, 'responsable de entrega', 160), responsable_recibe: optionalText(req.body.responsable_recibe, 'responsable que recibe', 160),
    lugar: text(req.body.lugar, 'lugar del hito', 3, 300), condicion_declarada: text(req.body.condicion_declarada, 'condición declarada', 3, 40), observacion: text(req.body.observacion, 'observación', 5, 2500),
    temperatura_c: req.body.temperatura_c == null || req.body.temperatura_c === '' ? null : number(req.body.temperatura_c, 'temperatura medida declarada', -80, 120),
    conserva_frio: req.body.conserva_frio == null ? null : bool(req.body.conserva_frio, 'conserva_frio') };
  if (!['sin_verificar','sin_novedad','requiere_revision','no_conforme'].includes(value.condicion_declarada)) fail(422, 'CUSTODY_CONDITION', 'Seleccione una condición válida.');
  if (['recogido','entregado','confirmado'].includes(type) && (!value.responsable_entrega || !value.responsable_recibe)) fail(422, 'CUSTODY_PEOPLE', 'Identifique a quien entrega y a quien recibe en la transferencia.');
  const result = await transaction(async client => {
    const t = await trackingFor(req.user, id(req.params.id), client, true);
    if (number(req.body.version, 'versión', 1, 2147483647) !== t.version) fail(409, 'CUSTODY_CONFLICT', 'Otro usuario actualizó el seguimiento. Recargue antes de registrar el hito.');
    if (t.solicitud_estado !== 'aceptada' || t.donacion_estado === 'cancelada') fail(409, 'CUSTODY_CANCELED', 'La operación fue cancelada y no admite nuevos hitos.');
    if (t.estado === 'confirmado') fail(409, 'CUSTODY_CLOSED', 'La recepción ya fue confirmada. Puede registrar una incidencia posterior.');
    if (type !== 'observacion' && transitions[t.estado] !== type) fail(409, 'CUSTODY_SEQUENCE', 'Los hitos deben registrarse en orden, sin saltar etapas.');
    if (type === 'confirmado' && (t.incidencias_criticas > 0 || value.condicion_declarada !== 'sin_novedad')) fail(409, 'CUSTODY_REVIEW', 'Resuelva las incidencias críticas y registre la revisión antes de confirmar. La entrega puede mantenerse registrada para revisión.');
    const next = type === 'observacion' ? t.estado : type;
    const entries = Object.entries(value);
    const h = (await client.query(`INSERT INTO hito_custodia(id_seguimiento,id_usuario,tipo,estado_resultante,${entries.map(([k])=>k).join(',')},es_demostracion)
      VALUES($1,$2,$3,$4,${entries.map((_,i)=>`$${i+5}`).join(',')},$${entries.length+5}) RETURNING *`, [t.id_seguimiento,req.user.id_usuario,type,next,...entries.map(([,v])=>v),req.user.es_demostracion])).rows[0];
    const custodian = ['recogido','entregado','confirmado'].includes(type) ? value.responsable_recibe : t.custodio_actual;
    await client.query('UPDATE seguimiento SET estado=$2,custodio_actual=$3,version=version+1,fecha_actualizacion=now() WHERE id_seguimiento=$1', [t.id_seguimiento,next,custodian]);
    if (value.condicion_declarada === 'no_conforme') {
      await client.query(`INSERT INTO incidencia(id_seguimiento,id_usuario,tipo,severidad,titulo,descripcion) VALUES($1,$2,'calidad','alta','Condición no conforme declarada en custodia',$3)`, [t.id_seguimiento,req.user.id_usuario,value.observacion]);
    }
    await audit(client,req.user.id_usuario,'seguimiento',t.id_seguimiento,'registrar_hito',{id_hito:h.id_hito,tipo:type,estado:next,condicion_declarada:value.condicion_declarada});
    return h;
  });
  res.status(201).json({ data: result });
});

custodyRouter.get('/incidencias', async (req,res) => {
  const filter=scope(req.user);
  res.json({ data: (await pool.query(`SELECT i.*,d.alimento,s.id_solicitud,s.id_donacion,t.origen,t.destino,u.nombre AS actor_nombre,r.nombre AS resuelto_por
    FROM incidencia i JOIN seguimiento t USING(id_seguimiento) JOIN solicitud s USING(id_solicitud) JOIN donacion d USING(id_donacion)
    JOIN usuario u ON u.id_usuario=i.id_usuario LEFT JOIN usuario r ON r.id_usuario=i.id_usuario_resuelve
    WHERE ${filter.sql} AND NOT d.ocultar_presentacion ORDER BY CASE WHEN i.estado='abierta' THEN 0 ELSE 1 END,i.fecha_creacion DESC LIMIT 200`,filter.params)).rows });
});
custodyRouter.post('/seguimiento/:id/incidencias', async (req,res) => {
  const type=text(req.body.tipo,'tipo',3,40),severity=text(req.body.severidad,'severidad',3,20);
  if (!['demora','temperatura','envase','calidad','otro'].includes(type) || !['baja','media','alta'].includes(severity)) fail(422,'INCIDENT_INVALID','Seleccione tipo y severidad válidos.');
  const title=text(req.body.titulo,'título',5,180),description=text(req.body.descripcion,'descripción',10,2500);
  const result=await transaction(async client=>{
    const t=await trackingFor(req.user,id(req.params.id),client,true);
    const i=(await client.query(`INSERT INTO incidencia(id_seguimiento,id_usuario,tipo,severidad,titulo,descripcion) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[t.id_seguimiento,req.user.id_usuario,type,severity,title,description])).rows[0];
    await client.query('UPDATE seguimiento SET version=version+1,fecha_actualizacion=now() WHERE id_seguimiento=$1',[t.id_seguimiento]);
    await audit(client,req.user.id_usuario,'incidencia',i.id_incidencia,'reportar',{id_seguimiento:t.id_seguimiento,severidad:severity}); return i;
  });res.status(201).json({data:result});
});
custodyRouter.post('/incidencias/:id/resolver',requireRole('administrador'),async(req,res)=>{
  const resolution=text(req.body.resolucion,'resolución',10,2500);
  const result=await transaction(async client=>{
    const ref=(await client.query('SELECT id_seguimiento FROM incidencia WHERE id_incidencia=$1',[id(req.params.id)])).rows[0];
    if(!ref)fail(404,'INCIDENT_NOT_FOUND','No se encontró la incidencia.');
    await client.query('SELECT 1 FROM seguimiento WHERE id_seguimiento=$1 FOR UPDATE',[ref.id_seguimiento]);
    const i=(await client.query(`UPDATE incidencia SET estado='resuelta',resolucion=$2,id_usuario_resuelve=$3,fecha_resolucion=now() WHERE id_incidencia=$1 AND estado='abierta' RETURNING *`,[id(req.params.id),resolution,req.user.id_usuario])).rows[0];
    if(!i)fail(409,'INCIDENT_CLOSED','La incidencia ya fue resuelta.');
    await client.query('UPDATE seguimiento SET version=version+1,fecha_actualizacion=now() WHERE id_seguimiento=$1',[i.id_seguimiento]);
    await audit(client,req.user.id_usuario,'incidencia',i.id_incidencia,'resolver',{resolucion:resolution});return i;
  });res.json({data:result});
});
