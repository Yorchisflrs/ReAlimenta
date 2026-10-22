import { db, pool, transaction, audit } from '../server/db.js';
import { userFromRow } from '../server/auth.js';
import { createTracking, evaluateTracking, getTracking } from '../server/custody.js';
import { COLD_CHAIN_MESSAGE } from '../server/mappers.js';

// Un nuevo escenario vigente, sin cambiar fechas ni hitos de lotes anteriores.
try {
  const [orgRow, donorRow] = await Promise.all(['organizacion@realimenta.test', 'donante@realimenta.test'].map(async correo => (await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo])).rows[0]));
  if (!orgRow || !donorRow) throw new Error('No se encontraron las cuentas demostrativas. Ejecute primero npm run db:seed.');
  const [org, donor] = await Promise.all([userFromRow(orgRow), userFromRow(donorRow)]);
  const existing = (await db.query(`SELECT d.id_donacion, e.id_entrega FROM donaciones d JOIN entregas e ON e.id_donacion = d.id_donacion
    WHERE d.id_donante = ? AND d.descripcion LIKE '[DEMO:VIGENTE:SALSA]%' AND d.fecha_limite_aprovechamiento > NOW() + INTERVAL 30 MINUTE AND e.estado = 'pendiente'
    ORDER BY d.id_donacion DESC LIMIT 1`, [donor.perfil.id_donante])).rows[0];
  if (existing) console.log(JSON.stringify({ reutilizado: true, id_donacion: existing.id_donacion, id_seguimiento: existing.id_entrega }));
  else {
    const created = await transaction(async client => {
      const d = await client.query(`INSERT INTO donaciones (id_donante, nombre_alimento, categoria, cantidad, unidad, descripcion, estado_producto, fecha_disponibilidad,
        fecha_limite_recojo, fecha_limite_aprovechamiento, direccion_recojo, latitud, longitud, tipo_conservacion, requiere_cadena_frio, tipo_envase, observaciones, estado)
        VALUES (?, 'Salsa de tomate · coordinación inmediata', 'Alimentos preparados', 12, 'porciones', ?, 'preparado', NOW() - INTERVAL 1 MINUTE, NOW() + INTERVAL 30 MINUTE,
        NOW() + INTERVAL 70 MINUTE, 'Av. Sesquicentenario · sector universitario UNA, Puno (punto de demostración)', -15.8268629, -70.0141356, 'Refrigerado', TRUE,
        'Contenedor con tapa de demostración', ?, 'en_proceso')`, [donor.perfil.id_donante,
        '[DEMO:VIGENTE:SALSA] Escenario académico ficticio con plazo de 70 minutos para comprobar el cálculo; no representa un lote físico ni una recomendación sanitaria.',
        'Conservación refrigerada declarada para la demostración; debe verificarse en operaciones reales. Plazo específico del escenario, no vida útil universal del alimento.']);
      const s = await client.query(`INSERT INTO solicitudes (id_donacion, id_organizacion, cantidad_solicitada, responsable_recojo, telefono_recojo, fecha_recojo_propuesta,
        tipo_transporte, recipiente, mensaje, observaciones, estado) VALUES (?, ?, 12, 'Responsable logístico de demostración', '000000000', NOW() + INTERVAL 5 MINUTE,
        'Vehículo de muestra con medios de conservación declarados', 'Contenedor cerrado de muestra', ?, 'Escenario académico ficticio, no operación física real.', 'aceptada')`,
        [d.insertId, org.perfil.id_organizacion, COLD_CHAIN_MESSAGE]);
      await client.query('INSERT INTO asignaciones (id_donacion, id_solicitud) VALUES (?, ?)', [d.insertId, s.insertId]);
      const t = await createTracking(client, s.insertId, donor.id_usuario);
      await audit(client, donor.id_usuario, 'donaciones', d.insertId, 'semilla_vigente', { escenario_ficticio: true, plazo_min: 70, operaciones_previas_modificadas: false });
      return { id_donacion: d.insertId, id_seguimiento: t.id_entrega };
    });
    const tracking = await getTracking(org, created.id_seguimiento);
    const evaluated = await evaluateTracking(tracking, org, { preparacion_min: 10, recojo_min: 10, entrega_min: 5, margen_seguridad_min: 15 });
    console.log(JSON.stringify({ ...created, semaforo: evaluated.evaluacion.estado_viabilidad, distancia_km: evaluated.ruta.distancia_km, minutos_base: evaluated.ruta.duracion_estimada_min, margen_min: evaluated.evaluacion.margen_tiempo_min }));
  }
} catch (error) { console.error('No se pudo preparar el escenario vigente:', error.code || '', error.message); process.exitCode = 1; }
finally { await pool.end(); }
