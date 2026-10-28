// Traducción entre las columnas de la base MySQL "realimenta" y los nombres que consume el frontend.
// Así la interfaz conserva su contrato mientras los datos se guardan en las tablas existentes.

export const ACTIVE_REQUEST_STATES = ['pendiente', 'en_revision', 'aceptada'];
export const PENDING_REQUEST_STATES = ['pendiente', 'en_revision'];
export const FOOD_PROFILES = ['general', 'panaderia', 'frutas', 'hortalizas', 'preparado', 'refrigerado', 'seco'];

// Las tablas donantes/organizaciones no tienen columna "referencia": se conserva dentro de la dirección.
export const REFERENCE_SEPARATOR = ' · Ref.: ';
export const composeAddress = (direccion, referencia) => referencia ? `${direccion}${REFERENCE_SEPARATOR}${referencia}` : direccion;
export function splitAddress(value) {
  const text = String(value ?? '');
  const index = text.lastIndexOf(REFERENCE_SEPARATOR);
  return index < 0 ? { direccion: text, referencia: '' } : { direccion: text.slice(0, index), referencia: text.slice(index + REFERENCE_SEPARATOR.length) };
}

// solicitudes no tiene columna booleana de cadena de frío: la declaración queda como mensaje al donante.
export const COLD_CHAIN_MESSAGE = 'La beneficiaria declara medios para mantener la cadena de frío durante el traslado.';
export const coldChainDeclared = mensaje => typeof mensaje === 'string' && mensaje.startsWith(COLD_CHAIN_MESSAGE);

export function parseDetail(value) {
  if (!value) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : { texto: String(value) }; }
  catch { return { texto: String(value) }; }
}

const hasCoordinates = row => row.latitud !== null && row.latitud !== undefined && row.longitud !== null && row.longitud !== undefined;
function location(row) {
  const { direccion, referencia } = splitAddress(row.direccion);
  return {
    direccion, referencia, departamento: row.departamento || '', provincia: row.provincia || '', distrito: row.distrito || '',
    latitud: row.latitud, longitud: row.longitud, ubicacion_confirmada: hasCoordinates(row)
  };
}
export function donorProfile(row) {
  if (!row) return null;
  return {
    id_donante: row.id_donante, id_usuario: row.id_usuario, nombre_establecimiento: row.nombre_establecimiento,
    ruc: row.ruc, tipo_establecimiento: row.tipo_establecimiento, responsable: row.responsable || '',
    ...location(row), estado_verificacion: row.estado_verificacion || 'pendiente', fecha_registro: row.fecha_registro
  };
}
export function organizationProfile(row) {
  if (!row) return null;
  return {
    id_organizacion: row.id_organizacion, id_usuario: row.id_usuario, nombre: row.nombre, tipo_organizacion: row.tipo_organizacion,
    responsable: row.responsable || '', numero_beneficiarios: row.numero_beneficiarios,
    ...location(row), estado_verificacion: row.estado_verificacion || 'pendiente', fecha_registro: row.fecha_registro
  };
}

// donaciones (MySQL) -> donación (API). El distrito proviene del perfil del donante.
export function donationFromRow(d, donor = null) {
  return {
    id_donacion: d.id_donacion, id_donante: d.id_donante,
    alimento: d.nombre_alimento, categoria: d.categoria || '', descripcion: d.descripcion || '',
    cantidad: d.cantidad, unidad: d.unidad,
    perfil_alimento: FOOD_PROFILES.includes(d.estado_producto) ? d.estado_producto : 'general',
    estado_producto: d.estado_producto, fecha_elaboracion: d.fecha_elaboracion, fecha_vencimiento: d.fecha_vencimiento,
    fecha_disponibilidad: d.fecha_disponibilidad, fecha_limite_recojo: d.fecha_limite_recojo,
    fecha_limite_aprovechamiento_declarada: d.fecha_limite_aprovechamiento,
    direccion_recojo: d.direccion_recojo || '', referencia: d.indicaciones_recojo || '', indicaciones_recojo: d.indicaciones_recojo || '',
    distrito: donor?.distrito || '',
    latitud_recojo: d.latitud, longitud_recojo: d.longitud,
    conservacion_declarada: d.tipo_conservacion || '', requiere_cadena_frio: d.requiere_cadena_frio === true,
    temperatura_declarada: d.temperatura_declarada || '', envase: d.tipo_envase || '', estado_envase: d.estado_envase,
    observaciones: d.observaciones || '', estado: d.estado,
    fecha_creacion: d.fecha_creacion, fecha_actualizacion: d.fecha_actualizacion,
    imagen_clave: '', fotos: []
  };
}

// Distrito distinto al del perfil: se agrega a la dirección de recojo para no perderlo.
function pickupAddress(direccion, distrito, donorDistrict) {
  const same = value => String(value || '').trim().toLocaleLowerCase('es');
  if (!distrito || same(distrito) === same(donorDistrict) || same(direccion).includes(same(distrito))) return direccion;
  return `${direccion}, ${distrito}`;
}
// donación validada (API) -> columnas de donaciones.
export function toDonationColumns(value, donor) {
  const direccion = pickupAddress(value.direccion_recojo, value.distrito, donor?.distrito);
  return {
    nombre_alimento: value.alimento,
    categoria: value.categoria,
    descripcion: value.descripcion || null,
    cantidad: value.cantidad,
    unidad: value.unidad,
    estado_producto: value.perfil_alimento,
    fecha_disponibilidad: new Date(value.fecha_disponibilidad),
    fecha_limite_recojo: new Date(value.fecha_limite_recojo),
    fecha_limite_aprovechamiento: value.fecha_limite_aprovechamiento_declarada ? new Date(value.fecha_limite_aprovechamiento_declarada) : null,
    direccion_recojo: direccion.length > 255 ? value.direccion_recojo : direccion,
    latitud: value.latitud_recojo,
    longitud: value.longitud_recojo,
    tipo_conservacion: value.conservacion_declarada,
    requiere_cadena_frio: value.requiere_cadena_frio,
    temperatura_declarada: value.temperatura_declarada || null,
    tipo_envase: value.envase,
    indicaciones_recojo: value.referencia || null,
    observaciones: value.observaciones || null
  };
}

// solicitudes (MySQL) -> solicitud (API).
export function requestFields(s) {
  return {
    id_solicitud: s.id_solicitud, id_donacion: s.id_donacion, id_organizacion: s.id_organizacion,
    responsable_recojo: s.responsable_recojo || '', telefono: s.telefono_recojo || '',
    transporte_declarado: s.tipo_transporte || '', recipiente_declarado: s.recipiente || '',
    dispone_cadena_frio: coldChainDeclared(s.mensaje), fecha_propuesta: s.fecha_recojo_propuesta,
    cantidad_solicitada: s.cantidad_solicitada, mensaje: s.mensaje || '', observaciones: s.observaciones || '',
    estado: s.estado, fecha_creacion: s.fecha_solicitud, fecha_solicitud: s.fecha_solicitud,
    fecha_actualizacion: s.fecha_solicitud, motivo_decision: null
  };
}

export function photoFromRow(f) {
  return {
    id_foto: f.id_foto, id_donacion: f.id_donacion, url: `/media/donaciones/${f.nombre_archivo}`,
    nombre: f.nombre_original || 'fotografia', nombre_archivo: f.nombre_archivo, ruta_archivo: f.ruta_archivo,
    tipo_mime: f.tipo_mime, tamano_bytes: f.tamano_bytes, es_principal: f.es_principal === true, fecha_subida: f.fecha_subida
  };
}

// evaluaciones_ruta (MySQL) -> evaluación (API), con los alias que esperaba la interfaz.
export function evaluationFromRow(e) {
  if (!e) return null;
  return {
    ...e, estado_viabilidad: e.semaforo, proveedor_ruta: e.proveedor_mapa,
    detalle: { estado_viabilidad: e.semaforo, tiempo_total_estimado_min: e.tiempo_total_estimado_min, margen_tiempo_min: e.margen_tiempo_min, tiempo_restante_min: e.tiempo_disponible_min }
  };
}

export const likeEscape = value => String(value).replace(/[\\%_]/g, character => `\\${character}`);
export const likePattern = value => `%${likeEscape(value)}%`;
