export function fail(status, code, message, details) {
  const error = new Error(message);
  Object.assign(error, { status, code, details });
  throw error;
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if(error.type==='entity.too.large')return res.status(413).json({error:{code:'FILE_TOO_LARGE',message:'La fotografía supera 5 MB, o el contenido enviado excede el tamaño permitido.'}});
  if (error.code === '23505') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Ya existe un registro activo equivalente. Actualice la pantalla y revise el estado.' } });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El contenido enviado no es JSON válido.' } });
  }
  const status = error.status || (['ECONNREFUSED', '57P01', '53300'].includes(error.code) ? 503 : 500);
  if (status >= 500) console.error(`${req.method} ${req.path}:`, error.message);
  res.status(status).json({ error: {
    code: error.status ? (error.code || 'ERROR') : (status === 503 ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR'),
    message: error.status ? error.message : (status === 503 ? 'La base de datos no está disponible. Intente nuevamente.' : 'No se pudo completar la operación. Intente nuevamente.'),
    ...(error.details ? { details: error.details } : {})
  } });
}
