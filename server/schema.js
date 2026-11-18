// Columnas que utiliza la aplicación en la base existente "realimenta". Solo se consulta
// INFORMATION_SCHEMA: la aplicación nunca crea, modifica ni elimina tablas.
export const REQUIRED_SCHEMA = {
  usuarios: ['id_usuario', 'nombres', 'apellidos', 'correo', 'password_hash', 'telefono', 'rol', 'estado', 'fecha_registro'],
  donantes: ['id_donante', 'id_usuario', 'nombre_establecimiento', 'ruc', 'tipo_establecimiento', 'responsable', 'direccion', 'departamento', 'provincia', 'distrito', 'latitud', 'longitud', 'estado_verificacion', 'dni_representante', 'foto_local', 'subsanacion_habilitada'],
  organizaciones: ['id_organizacion', 'id_usuario', 'nombre', 'tipo_organizacion', 'responsable', 'numero_beneficiarios', 'direccion', 'departamento', 'provincia', 'distrito', 'latitud', 'longitud', 'estado_verificacion', 'dni_representante', 'foto_local', 'codigo_registro', 'subsanacion_habilitada'],
  donaciones: ['id_donacion', 'id_donante', 'nombre_alimento', 'categoria', 'descripcion', 'cantidad', 'unidad', 'estado_producto', 'estado_alimento_declarado', 'borrador', 'fecha_elaboracion', 'fecha_vencimiento', 'fecha_disponibilidad', 'fecha_limite_recojo', 'fecha_limite_aprovechamiento', 'direccion_recojo', 'distrito_recojo', 'latitud', 'longitud', 'tipo_conservacion', 'requiere_cadena_frio', 'temperatura_declarada', 'tipo_envase', 'estado_envase', 'indicaciones_recojo', 'observaciones', 'estado', 'fecha_creacion', 'fecha_actualizacion'],
  donacion_fotos: ['id_foto', 'id_donacion', 'nombre_original', 'nombre_archivo', 'ruta_archivo', 'tipo_mime', 'tamano_bytes', 'es_principal', 'fecha_subida'],
  solicitudes: ['id_solicitud', 'id_donacion', 'id_organizacion', 'cantidad_solicitada', 'responsable_recojo', 'telefono_recojo', 'fecha_recojo_propuesta', 'tipo_transporte', 'recipiente', 'mensaje', 'observaciones', 'estado', 'fecha_solicitud', 'tiempo_llegada_min'],
  asignaciones: ['id_asignacion', 'id_donacion', 'id_solicitud', 'fecha_asignacion'],
  seguimientos: ['id_seguimiento', 'id_donacion', 'id_usuario', 'etapa', 'responsable', 'observaciones', 'fecha_evento'],
  entregas: ['id_entrega', 'id_donacion', 'id_solicitud', 'responsable_entrega', 'responsable_recepcion', 'cantidad_entregada', 'fecha_recojo', 'fecha_entrega', 'fecha_confirmacion', 'observaciones', 'estado'],
  evaluaciones_ruta: ['id_evaluacion', 'id_donacion', 'id_organizacion', 'id_solicitud', 'origen_latitud', 'origen_longitud', 'destino_latitud', 'destino_longitud', 'distancia_km', 'duracion_estimada_min', 'tiempo_preparacion_min', 'tiempo_recojo_min', 'tiempo_entrega_min', 'tiempo_total_estimado_min', 'tiempo_disponible_min', 'margen_tiempo_min', 'semaforo', 'proveedor_mapa', 'fecha_calculo'],
  incidencias: ['id_incidencia', 'id_donacion', 'id_solicitud', 'id_usuario', 'tipo', 'descripcion', 'estado', 'fecha_registro', 'fecha_resolucion'],
  notificaciones: ['id_notificacion', 'id_usuario', 'id_donacion', 'id_solicitud', 'titulo', 'mensaje', 'tipo', 'leida', 'fecha_creacion'],
  auditoria: ['id_auditoria', 'id_usuario', 'modulo', 'accion', 'tabla_afectada', 'id_registro', 'descripcion', 'fecha'],
  catalogos: ['id_catalogo', 'tipo', 'valor', 'activo', 'orden', 'fecha_creacion'],
  verificaciones: ['id_verificacion', 'id_usuario', 'id_administrador', 'tipo_verificacion', 'resultado', 'estado_anterior', 'codigo_registro', 'ruc', 'observaciones', 'motivo', 'subsanable', 'fecha'],
  verificacion_documentos: ['id_documento', 'id_usuario', 'id_verificacion', 'id_subido_por', 'origen', 'nombre_original', 'nombre_archivo', 'tipo_mime', 'tamano_bytes', 'fecha'],
  recuperacion_contrasenas: ['id_usuario', 'token_hash', 'password_huella', 'vence', 'creado']
};
// Valores de enum que usa la aplicación y que se agregaron después (db/actualizar_modulos_definitivos.sql).
const REQUIRED_VALUES = { donantes: { estado_verificacion: 'en_revision' }, organizaciones: { estado_verificacion: 'en_revision' } };

export async function inspectSchema(client) {
  const rows = (await client.query(`SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna, COLUMN_TYPE AS tipo
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`)).rows;
  const found = new Map(), types = new Map();
  for (const { tabla, columna, tipo } of rows) {
    if (!found.has(tabla)) found.set(tabla, new Set());
    found.get(tabla).add(columna);
    types.set(`${tabla}.${columna}`, String(tipo));
  }
  const missingTables = [], missingColumns = {};
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    if (!found.has(table)) { missingTables.push(table); continue; }
    const absent = columns.filter(column => !found.get(table).has(column));
    for (const [column, value] of Object.entries(REQUIRED_VALUES[table] || {}))
      if (found.get(table).has(column) && !types.get(`${table}.${column}`).includes(`'${value}'`)) absent.push(`${column} (falta el valor '${value}')`);
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
