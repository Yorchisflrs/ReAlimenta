/* Cliente HTTP compartido. Las sesiones y las reglas de negocio viven en el servidor. */
(() => {
  let csrfToken = '';
  let session = null;
  async function request(path, options = {}) {
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD'].includes(method.toUpperCase()) && csrfToken) headers['x-csrf-token'] = csrfToken;
    let response;
    try {
      response = await fetch(path, { credentials: 'same-origin', ...options, method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    } catch (_) {
      throw new Error('No se pudo conectar con REAlimenta. Comprueba que el servidor esté iniciado e inténtalo de nuevo.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error?.message || `No se pudo completar la operación (${response.status}).`);
      error.status = response.status;
      error.code = result.error?.code;
      error.details = result.error?.details;
      throw error;
    }
    if (result.csrfToken) csrfToken = result.csrfToken;
    if (result.user) session = result.user;
    return result;
  }
  async function me() {
    const result = await request('/api/auth/me');
    session = result.user;
    return session;
  }
  window.REA = { request, me, get user() { return session; }, destination(role) { return ({ donante: 'donante.html', organizacion: 'organizacion.html', administrador: 'administrador.html' })[role] || 'login.html'; } };
})();
