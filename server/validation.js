import { fail } from './errors.js';
import { composeAddress, FOOD_PROFILES } from './mappers.js';

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
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 2147483647) fail(400, 'INVALID_ID', 'El identificador no es válido.');
  return parsed;
}
export function coordinates(input, lat = 'latitud', lon = 'longitud') {
  return { [lat]: number(input[lat], lat, -90, 90), [lon]: number(input[lon], lon, -180, 180) };
}

// Devuelve las columnas de donantes u organizaciones (MySQL) listas para guardar.
export function profileInput(body, role) {
  const data = body.perfil || body;
  const direccion = text(data.direccion, 'dirección', 5, 255);
  const referencia = optionalText(data.referencia, 'referencia', 200);
  const fullAddress = composeAddress(direccion, referencia);
  if (fullAddress.length > 255) fail(422, 'VALIDATION_ERROR', 'Revise el campo referencia.', { referencia: 'La dirección y la referencia juntas no pueden superar 255 caracteres.' });
  const result = {
    departamento: text(data.departamento || 'Puno', 'departamento', 2, 100),
    provincia: text(data.provincia || 'Puno', 'provincia', 2, 100),
    distrito: text(data.distrito, 'distrito', 2, 100),
    direccion: fullAddress,
    ...coordinates(data),
    responsable: text(data.responsable || body.nombre, 'responsable', 2, 150)
  };
  if (!bool(data.ubicacion_confirmada, 'ubicacion_confirmada')) fail(422, 'LOCATION_UNCONFIRMED', 'Confirme la ubicación en el mapa antes de guardarla.');
  if (role === 'donante') result.nombre_establecimiento = text(data.nombre_establecimiento, 'nombre del establecimiento', 2, 200);
  else result.nombre = text(data.nombre || body.nombre, 'nombre de la organización', 2, 200);
  return result;
}

// cantidad es decimal(12,2) en MySQL.
function quantity(value) {
  const rounded = Math.round(number(value, 'cantidad', 0.01, 9999999999.99) * 100) / 100;
  if (rounded < 0.01) fail(422, 'VALIDATION_ERROR', 'cantidad debe estar entre 0.01 y 9999999999.99.');
  return rounded;
}

// Valida con los nombres del formulario; los límites corresponden a las columnas de donaciones.
export function donationInput(body) {
  const foodProfile = body.perfil_alimento || 'general';
  if (!FOOD_PROFILES.includes(foodProfile)) fail(422, 'FOOD_PROFILE_INVALID', 'Seleccione un tipo de alimento válido.');
  const value = {
    perfil_alimento: foodProfile,
    alimento: text(body.alimento, 'alimento', 2, 200),
    categoria: text(body.categoria, 'categoría', 2, 100),
    cantidad: quantity(body.cantidad),
    unidad: text(body.unidad, 'unidad', 1, 50),
    descripcion: optionalText(body.descripcion, 'descripción'),
    fecha_disponibilidad: date(body.fecha_disponibilidad, 'fecha de disponibilidad'),
    fecha_limite_recojo: date(body.fecha_limite_recojo, 'fecha límite de recojo'),
    fecha_limite_aprovechamiento_declarada: date(body.fecha_limite_aprovechamiento_declarada, 'fecha límite de aprovechamiento declarada', true),
    direccion_recojo: text(body.direccion_recojo, 'dirección de recojo', 5, 255),
    distrito: text(body.distrito, 'distrito', 2, 100),
    referencia: optionalText(body.referencia, 'referencia', 300),
    ...coordinates(body, 'latitud_recojo', 'longitud_recojo'),
    conservacion_declarada: text(body.conservacion_declarada, 'conservación declarada', 3, 100),
    requiere_cadena_frio: bool(body.requiere_cadena_frio, 'requiere_cadena_frio'),
    temperatura_declarada: optionalText(body.temperatura_declarada, 'temperatura declarada', 50),
    envase: text(body.envase, 'envase', 2, 100),
    observaciones: optionalText(body.observaciones, 'observaciones')
  };
  const available = Date.parse(value.fecha_disponibilidad), pickup = Date.parse(value.fecha_limite_recojo);
  const limit = value.fecha_limite_aprovechamiento_declarada && Date.parse(value.fecha_limite_aprovechamiento_declarada);
  if (pickup <= available) fail(422, 'INVALID_DATES', 'El límite de recojo debe ser posterior a la disponibilidad.');
  if (pickup <= Date.now()) fail(422, 'INVALID_DATES', 'El límite de recojo debe estar en el futuro.');
  if (limit && limit < pickup) fail(422, 'INVALID_DATES', 'El aprovechamiento declarado no puede finalizar antes del límite de recojo.');
  return value;
}
