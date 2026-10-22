// Columnas que utiliza la aplicación en la base existente "realimenta". Solo se consulta
// INFORMATION_SCHEMA: la aplicación nunca crea, modifica ni elimina tablas.
export const REQUIRED_SCHEMA = {
  usuarios: ['id_usuario', 'nombres', 'apellidos', 'correo', 'password_hash', 'telefono', 'rol', 'estado', 'fecha_registro'],
  donantes: ['id_donante', 'id_usuario', 'nombre_establecimiento', 'ruc', 'tipo_establecimiento', 'responsable', 'direccion', 'departamento', 'provincia', 'distrito', 'latitud', 'longitud', 'estado_verificacion'],
  organizaciones: ['id_organizacion', 'id_usuario', 'nombre', 'tipo_organizacion', 'responsable', 'numero_beneficiarios', 'direccion', 'departamento', 'provincia', 'distrito', 'latitud', 'longitud', 'estado_verificacion'],
  donaciones: ['id_donacion', 'id_donante', 'nombre_alimento', 'categoria', 'descripcion', 'cantidad', 'unidad', 'estado_producto', 'fecha_elaboracion', 'fecha_vencimiento', 'fecha_disponibilidad', 'fecha_limite_recojo', 'fecha_limite_aprovechamiento', 'direccion_recojo', 'latitud', 'longitud', 'tipo_conservacion', 'requiere_cadena_frio', 'temperatura_declarada', 'tipo_envase', 'estado_envase', 'indicaciones_recojo', 'observaciones', 'estado', 'fecha_creacion', 'fecha_actualizacion'],
  donacion_fotos: ['id_foto', 'id_donacion', 'nombre_original', 'nombre_archivo', 'ruta_archivo', 'tipo_mime', 'tamano_bytes', 'es_principal', 'fecha_subida'],
  solicitudes: ['id_solicitud', 'id_donacion', 'id_organizacion', 'cantidad_solicitada', 'responsable_recojo', 'telefono_recojo', 'fecha_recojo_propuesta', 'tipo_transporte', 'recipiente', 'mensaje', 'observaciones', 'estado', 'fecha_solicitud'],
  asignaciones: ['id_asignacion', 'id_donacion', 'id_solicitud', 'fecha_asignacion'],
  seguimientos: ['id_seguimiento', 'id_donacion', 'id_usuario', 'etapa', 'responsable', 'observaciones', 'fecha_evento'],
  entregas: ['id_entrega', 'id_donacion', 'id_solicitud', 'responsable_entrega', 'responsable_recepcion', 'cantidad_entregada', 'fecha_recojo', 'fecha_entrega', 'fecha_confirmacion', 'observaciones', 'estado'],
  evaluaciones_ruta: ['id_evaluacion', 'id_donacion', 'id_organizacion', 'id_solicitud', 'origen_latitud', 'origen_longitud', 'destino_latitud', 'destino_longitud', 'distancia_km', 'duracion_estimada_min', 'tiempo_preparacion_min', 'tiempo_recojo_min', 'tiempo_entrega_min', 'tiempo_total_estimado_min', 'tiempo_disponible_min', 'margen_tiempo_min', 'semaforo', 'proveedor_mapa', 'fecha_calculo'],
  incidencias: ['id_incidencia', 'id_donacion', 'id_solicitud', 'id_usuario', 'tipo', 'descripcion', 'estado', 'fecha_registro', 'fecha_resolucion'],
  notificaciones: ['id_notificacion', 'id_usuario', 'id_donacion', 'id_solicitud', 'titulo', 'mensaje', 'tipo', 'leida', 'fecha_creacion'],
  auditoria: ['id_auditoria', 'id_usuario', 'modulo', 'accion', 'tabla_afectada', 'id_registro', 'descripcion', 'fecha']
};

export async function inspectSchema(client) {
  const rows = (await client.query(`SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`)).rows;
  const found = new Map();
  for (const { tabla, columna } of rows) {
    if (!found.has(tabla)) found.set(tabla, new Set());
    found.get(tabla).add(columna);
  }
  const missingTables = [], missingColumns = {};
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    if (!found.has(table)) { missingTables.push(table); continue; }
    const absent = columns.filter(column => !found.get(table).has(column));
    if (absent.length) missingColumns[table] = absent;
  }
  return {
    ok: !missingTables.length && !Object.keys(missingColumns).length,
    tablasEsperadas: Object.keys(REQUIRED_SCHEMA).length,
    tablasEncontradas: Object.keys(REQUIRED_SCHEMA).length - missingTables.length,
    tablasFaltantes: missingTables,
    columnasFaltantes: missingColumns
  };
}
