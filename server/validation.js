import { fail } from './errors.js';
import { composeAddress, FOOD_PROFILES } from './mappers.js';
import { PROVINCIAS, LIMITES, TELEFONO, NOMBRE, CORREO_REGISTRO } from './puno.js';

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

// Reglas de Puno/Perú: los mismos patrones que usa el navegador (server/puno.js).
const DISTRITOS = Object.values(PROVINCIAS).flat();
export function phone(value) {
  const digits = typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
  if (!new RegExp(TELEFONO).test(digits)) fail(422, 'INVALID_PHONE', 'El teléfono debe ser un celular de 9 dígitos que empiece con 9, o un fijo de Puno con su código (051 y 6 dígitos).');
  return digits;
}
export function personName(value, field) {
  const name = text(value, field, 5, 150).replace(/\s+/g, ' ');
  if (!new RegExp(NOMBRE).test(name)) fail(422, 'INVALID_NAME', `El ${field} solo puede tener letras y espacios.`);
  if (name.split(' ').filter(part => (part.match(/\p{L}/gu) || []).length >= 2).length < 2) fail(422, 'INVALID_NAME', `Escriba nombre y apellido en ${field}.`);
  return name;
}
// Texto libre que describe algo: exige letras y no acepta etiquetas ni símbolos de código.
export function words(value, field, min = 2, max = 300) {
  const result = text(value, field, min, max);
  if (/[<>{}[\]\\|^~`]/.test(result)) fail(422, 'VALIDATION_ERROR', `El campo ${field} tiene caracteres no permitidos.`);
  if ((result.match(/\p{L}/gu) || []).length < 2) fail(422, 'VALIDATION_ERROR', `El campo ${field} debe tener palabras, no solo números o símbolos.`);
  return result;
}
export function optionalWords(value, field, max = 2500) { return value == null || value === '' ? '' : words(value, field, 1, max); }
export function loginEmail(value) {
  const correo = text(value, 'correo', 5, 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fail(422, 'INVALID_EMAIL', 'Ingrese un correo válido, por ejemplo nombre@gmail.com.');
  return correo;
}
export function registrationEmail(value) {
  const correo = loginEmail(value);
  if (!new RegExp(CORREO_REGISTRO).test(correo)) fail(422, 'EMAIL_NOT_ALLOWED', 'Regístrese con su correo Gmail (@gmail.com) o con un correo institucional peruano (por ejemplo @unap.edu.pe o @munipuno.gob.pe).');
  return correo;
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    fail(422, 'INVALID_PASSWORD', 'La contraseña debe contener entre 12 y 128 caracteres.');
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) fail(422, 'INVALID_PASSWORD', 'La contraseña debe tener al menos una letra y un número.');
  return value;
}
export function punoCoordinates(input, lat = 'latitud', lon = 'longitud') {
  const point = coordinates(input, lat, lon);
  if (point[lat] < LIMITES.latMin || point[lat] > LIMITES.latMax || point[lon] < LIMITES.lonMin || point[lon] > LIMITES.lonMax)
    fail(422, 'OUTSIDE_PUNO', 'La ubicación marcada está fuera del departamento de Puno.');
  return point;
}
// Sin provincia (donaciones) se acepta cualquier distrito del departamento.
export function district(value, provincia) {
  const name = text(value, 'distrito', 2, 100);
  if (!(provincia ? PROVINCIAS[provincia] || [] : DISTRITOS).includes(name))
    fail(422, 'INVALID_DISTRICT', provincia ? `Elija un distrito de la provincia de ${provincia}.` : 'Elija un distrito del departamento de Puno.');
  return name;
}

// Devuelve las columnas de donantes u organizaciones (MySQL) listas para guardar.
export function profileInput(body, role) {
  const data = body.perfil || body;
  const direccion = words(data.direccion, 'dirección', 5, 255);
  const referencia = optionalWords(data.referencia, 'referencia', 200);
  const fullAddress = composeAddress(direccion, referencia);
  if (fullAddress.length > 255) fail(422, 'VALIDATION_ERROR', 'Revise el campo referencia.', { referencia: 'La dirección y la referencia juntas no pueden superar 255 caracteres.' });
  const result = {
    departamento: text(data.departamento || 'Puno', 'departamento', 2, 100),
    provincia: text(data.provincia || 'Puno', 'provincia', 2, 100),
    direccion: fullAddress,
    ...punoCoordinates(data),
    responsable: personName(data.responsable || body.nombre, 'nombre del responsable')
  };
  if (result.departamento !== 'Puno') fail(422, 'OUTSIDE_PUNO', 'Por ahora REAlimenta funciona solo en el departamento de Puno.');
  if (!PROVINCIAS[result.provincia]) fail(422, 'INVALID_PROVINCE', 'Elija una provincia de Puno.');
  result.distrito = district(data.distrito, result.provincia);
  if (!bool(data.ubicacion_confirmada, 'ubicacion_confirmada')) fail(422, 'LOCATION_UNCONFIRMED', 'Confirme la ubicación en el mapa antes de guardarla.');
  if (role === 'donante') result.nombre_establecimiento = words(data.nombre_establecimiento, 'nombre del establecimiento', 3, 200);
  else result.nombre = words(data.nombre || body.nombre, 'nombre de la beneficiaria', 3, 200);
  return result;
}

// cantidad es decimal(12,2) en MySQL.
function quantity(value) {
  // Tope razonable para la donación de un establecimiento: evita cifras escritas por error.
  const rounded = Math.round(number(value, 'cantidad', 0.01, 100000) * 100) / 100;
  if (rounded < 0.01) fail(422, 'VALIDATION_ERROR', 'cantidad debe estar entre 0.01 y 100000.');
  return rounded;
}

// Valida con los nombres del formulario; los límites corresponden a las columnas de donaciones.
export function donationInput(body) {
  const foodProfile = body.perfil_alimento || 'general';
  if (!FOOD_PROFILES.includes(foodProfile)) fail(422, 'FOOD_PROFILE_INVALID', 'Seleccione un tipo de alimento válido.');
  const value = {
    perfil_alimento: foodProfile,
    alimento: words(body.alimento, 'alimento', 2, 200),
    categoria: text(body.categoria, 'categoría', 2, 100),
    cantidad: quantity(body.cantidad),
    unidad: text(body.unidad, 'unidad', 1, 50),
    descripcion: optionalWords(body.descripcion, 'descripción'),
    fecha_disponibilidad: date(body.fecha_disponibilidad, 'fecha de disponibilidad'),
    fecha_limite_recojo: date(body.fecha_limite_recojo, 'fecha límite de recojo'),
    fecha_limite_aprovechamiento_declarada: date(body.fecha_limite_aprovechamiento_declarada, 'fecha límite de aprovechamiento declarada', true),
    direccion_recojo: words(body.direccion_recojo, 'dirección de recojo', 5, 255),
    distrito: district(body.distrito),
    referencia: optionalWords(body.referencia, 'referencia', 300),
    ...punoCoordinates(body, 'latitud_recojo', 'longitud_recojo'),
    conservacion_declarada: text(body.conservacion_declarada, 'conservación declarada', 3, 100),
    requiere_cadena_frio: bool(body.requiere_cadena_frio, 'requiere_cadena_frio'),
    temperatura_declarada: optionalText(body.temperatura_declarada, 'temperatura declarada', 50),
    envase: words(body.envase, 'envase', 2, 100),
    observaciones: optionalWords(body.observaciones, 'observaciones')
  };
  const available = Date.parse(value.fecha_disponibilidad), pickup = Date.parse(value.fecha_limite_recojo);
  const limit = value.fecha_limite_aprovechamiento_declarada && Date.parse(value.fecha_limite_aprovechamiento_declarada);
  if (pickup <= available) fail(422, 'INVALID_DATES', 'El límite de recojo debe ser posterior a la disponibilidad.');
  if (pickup <= Date.now()) fail(422, 'INVALID_DATES', 'El límite de recojo debe estar en el futuro.');
  if (limit && limit < pickup) fail(422, 'INVALID_DATES', 'El aprovechamiento declarado no puede finalizar antes del límite de recojo.');
  return value;
}
