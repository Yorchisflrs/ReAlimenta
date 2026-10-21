import { fail } from './errors.js';

export function text(value, field, min = 1, max = 300) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    fail(422, 'VALIDATION_ERROR', `Revise el campo ${field}.`, { [field]: `Debe contener entre ${min} y ${max} caracteres.` });
  return value.trim();
}
export function optionalText(value, field, max = 2500) { return value == null || value === '' ? '' : text(value, field, 0, max); }
export function number(value, field, min, max) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') fail(422, 'VALIDATION_ERROR', `Falta ${field}.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail(422, 'VALIDATION_ERROR', `${field} debe estar entre ${min} y ${max}.`);
  return parsed;
}
export function bool(value, field) {
  if (typeof value !== 'boolean') fail(422, 'VALIDATION_ERROR', `${field} debe ser verdadero o falso.`);
  return value;
}
export function date(value, field, optional = false) {
  if (optional && !value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  // Exigir zona explícita: evita que el huso horario del servidor cambie una fecha del formulario.
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value)))
    fail(422, 'VALIDATION_ERROR', `${field} debe ser una fecha válida con zona horaria.`);
  return new Date(value).toISOString();
}
export function id(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(400, 'INVALID_ID', 'El identificador no es válido.');
  return parsed;
}
export function coordinates(input, lat = 'latitud', lon = 'longitud') {
  return { [lat]: number(input[lat], lat, -90, 90), [lon]: number(input[lon], lon, -180, 180) };
}

export function profileInput(body, role) {
  const data = body.perfil || body;
  const result = {
    departamento: text(data.departamento || 'Puno', 'departamento', 2, 100),
    provincia: text(data.provincia || 'Puno', 'provincia', 2, 100),
    distrito: text(data.distrito, 'distrito', 2, 100),
    direccion: text(data.direccion, 'dirección', 5, 300),
    referencia: optionalText(data.referencia, 'referencia', 300),
    ...coordinates(data),
    ubicacion_confirmada: bool(data.ubicacion_confirmada, 'ubicacion_confirmada')
  };
  if (!result.ubicacion_confirmada) fail(422, 'LOCATION_UNCONFIRMED', 'Confirme la ubicación en el mapa antes de guardarla.');
  if (role === 'donante') result.nombre_establecimiento = text(data.nombre_establecimiento, 'nombre del establecimiento', 2, 180);
  else {
    result.nombre = text(data.nombre || body.nombre, 'nombre de la organización', 2, 180);
    result.responsable = text(data.responsable || body.nombre, 'responsable', 2, 160);
  }
  return result;
}

export function donationInput(body) {
  const image = optionalText(body.imagen_clave, 'imagen del alimento', 40);
  const foodProfile = body.perfil_alimento || 'general';
  if (!['','pan','fruta','verduras','yogur','arroz','sopa','salsa','galletas','leche','ensalada'].includes(image)) fail(422, 'IMAGE_INVALID', 'Seleccione una de las fotografías disponibles.');
  if (!['general','panaderia','frutas','hortalizas','preparado','refrigerado','seco'].includes(foodProfile)) fail(422, 'FOOD_PROFILE_INVALID', 'Seleccione un tipo de alimento válido.');
  const value = {
    imagen_clave: image,
    perfil_alimento: foodProfile,
    alimento: text(body.alimento, 'alimento', 2, 180),
    categoria: text(body.categoria, 'categoría', 2, 100),
    cantidad: number(body.cantidad, 'cantidad', 0.001, 999999999),
    unidad: text(body.unidad, 'unidad', 1, 40),
    descripcion: optionalText(body.descripcion, 'descripción'),
    fecha_disponibilidad: date(body.fecha_disponibilidad, 'fecha de disponibilidad'),
    fecha_limite_recojo: date(body.fecha_limite_recojo, 'fecha límite de recojo'),
    fecha_limite_aprovechamiento_declarada: date(body.fecha_limite_aprovechamiento_declarada, 'fecha límite de aprovechamiento declarada', true),
    direccion_recojo: text(body.direccion_recojo, 'dirección de recojo', 5, 300),
    distrito: text(body.distrito, 'distrito', 2, 100),
    ...coordinates(body, 'latitud_recojo', 'longitud_recojo'),
    conservacion_declarada: text(body.conservacion_declarada, 'conservación declarada', 3, 1000),
    requiere_cadena_frio: bool(body.requiere_cadena_frio, 'requiere_cadena_frio'),
    temperatura_declarada: optionalText(body.temperatura_declarada, 'temperatura declarada', 100),
    envase: text(body.envase, 'envase', 2, 300),
    observaciones: optionalText(body.observaciones, 'observaciones')
  };
  const available = Date.parse(value.fecha_disponibilidad), pickup = Date.parse(value.fecha_limite_recojo);
  const limit = value.fecha_limite_aprovechamiento_declarada && Date.parse(value.fecha_limite_aprovechamiento_declarada);
  if (pickup <= available) fail(422, 'INVALID_DATES', 'El límite de recojo debe ser posterior a la disponibilidad.');
  if (pickup <= Date.now()) fail(422, 'INVALID_DATES', 'El límite de recojo debe estar en el futuro.');
  if (limit && limit < pickup) fail(422, 'INVALID_DATES', 'El aprovechamiento declarado no puede finalizar antes del límite de recojo.');
  return value;
}
