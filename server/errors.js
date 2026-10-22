export function fail(status, code, message, details) {
  const error = new Error(message);
  Object.assign(error, { status, code, details });
  throw error;
}

// Errores de conexión o credenciales: la base no está disponible para atender la petición.
const UNAVAILABLE = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'EPIPE',
  'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR', 'ER_CON_COUNT_ERROR', 'ER_SERVER_SHUTDOWN']);
const CONFLICTS = {
  ER_DUP_ENTRY: ['CONFLICT', 'Ya existe un registro activo equivalente. Actualice la pantalla y revise el estado.'],
  ER_NO_REFERENCED_ROW_2: ['REFERENCE_CONFLICT', 'El registro relacionado ya no existe. Actualice la pantalla e intente nuevamente.'],
  ER_ROW_IS_REFERENCED_2: ['REFERENCE_CONFLICT', 'El registro está vinculado a otra información y no puede modificarse así.'],
  ER_LOCK_DEADLOCK: ['BUSY', 'Otro usuario estaba actualizando el mismo registro. Intente nuevamente.'],
  ER_LOCK_WAIT_TIMEOUT: ['BUSY', 'Otro usuario estaba actualizando el mismo registro. Intente nuevamente.']
};
const INVALID_DATA = new Set(['ER_DATA_TOO_LONG', 'WARN_DATA_TRUNCATED', 'ER_TRUNCATED_WRONG_VALUE',
  'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'ER_WARN_DATA_OUT_OF_RANGE', 'ER_BAD_NULL_ERROR', 'ER_NO_DEFAULT_FOR_FIELD']);

function databaseLog(req, error) {
  // Registro técnico solo en la consola del servidor; nunca se envía el mensaje SQL al navegador.
  console.error(`${req.method} ${req.path}: [${error.code || 'ERROR'}] ${error.sqlMessage || error.message}`);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'La fotografía supera 5 MB, o el contenido enviado excede el tamaño permitido.' } });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El contenido enviado no es JSON válido.' } });
  if (!error.status && CONFLICTS[error.code]) {
    databaseLog(req, error);
    const [code, message] = CONFLICTS[error.code];
    return res.status(409).json({ error: { code, message } });
  }
  if (!error.status && INVALID_DATA.has(error.code)) {
    databaseLog(req, error);
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Algún dato supera el tamaño o el formato permitido por la base de datos. Revise el formulario.' } });
  }
  const unavailable = !error.status && UNAVAILABLE.has(error.code);
  const status = error.status || (unavailable ? 503 : 500);
  if (status >= 500) databaseLog(req, error);
  res.status(status).json({ error: {
    code: error.status ? (error.code || 'ERROR') : (unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR'),
    message: error.status ? error.message : (unavailable ? 'La base de datos MySQL no está disponible. Intente nuevamente en unos momentos.' : 'No se pudo completar la operación. Intente nuevamente.'),
    ...(error.details ? { details: error.details } : {})
  } });
}
