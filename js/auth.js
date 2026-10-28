document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-public-stat]')) {
    REA.request('/api/public/stats').then(result => {
      const data = result.data || result;
      document.querySelectorAll('[data-public-stat]').forEach(item => { item.textContent = data[item.dataset.publicStat] ?? '—'; });
    }).catch(() => { document.querySelector('[data-public-seed-note]').textContent = 'Conteos no disponibles. Inicia el servidor para consultar los registros.'; });
  }
  const login = document.querySelector('#login-form');
  const register = document.querySelector('#register-form');
  const message = document.querySelector('[data-auth-message]');
  const showMessage = (text, success = false) => {
    if (!message) return;
    message.hidden = false;
    message.className = `mvp-message ${success ? 'success' : 'error'}`;
    message.textContent = text;
    message.focus();
  };
  document.querySelectorAll('[data-demo-account]').forEach(button => button.addEventListener('click', () => {
    document.querySelector('#login-email').value = `${button.dataset.demoAccount}@realimenta.test`;
    document.querySelector('#login-password').value = 'Realimenta2026!';
    document.querySelectorAll('[data-demo-account]').forEach(item => item.classList.toggle('selected', item === button));
    document.querySelector('#login-email').focus();
  }));
  document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    input.type = input.type === 'password' ? 'text' : 'password';
    button.setAttribute('aria-label', input.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
  }));
  login?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!login.reportValidity()) return;
    const button = login.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Iniciando sesión…';
    message.hidden = true;
    try {
      const result = await REA.request('/api/auth/login', { method: 'POST', body: { correo: login.correo.value.trim(), contrasena: login.contrasena.value } });
      const user = result.user || await REA.me();
      window.location.assign(REA.destination(user.rol));
    } catch (error) { showMessage(error.message); }
    finally { button.disabled = false; button.textContent = 'Entrar a mi cuenta'; }
  });

  if (!register) return;
  register.provincia.innerHTML = REARules.provinceOptions('Puno');
  register.distrito.innerHTML = REARules.districtOptions('Puno', 'Puno');
  let role = new URLSearchParams(location.search).get('tipo') === 'organizacion' ? 'organizacion' : 'donante';
  let confirmed = false;
  let picker = null;
  const roleInput = register.querySelector('[name="rol"]');
  const selectRole = value => {
    role = value;
    roleInput.value = role;
    document.querySelectorAll('[data-register-role]').forEach(button => { button.classList.toggle('selected', button.dataset.registerRole === role); button.setAttribute('aria-pressed', String(button.dataset.registerRole === role)); });
    document.querySelector('[data-entity-label]').textContent = role === 'donante' ? 'Nombre de tu negocio' : 'Nombre de tu entidad beneficiaria';
    register.entidad.placeholder = role === 'donante' ? 'Ej. Panadería San Juan' : 'Ej. Comedor Popular Virgen de la Candelaria';
  };
  document.querySelectorAll('[data-register-role]').forEach(button => button.addEventListener('click', () => selectRole(button.dataset.registerRole)));
  selectRole(role);
  const updateCoordinates = ({ latitud, longitud }) => {
    register.latitud.value = Number(latitud).toFixed(6);
    register.longitud.value = Number(longitud).toFixed(6);
    confirmed = false;
    document.querySelector('[data-location-confirm]').checked = false;
  };
  if (window.REAMaps) picker = REAMaps.mountPicker(document.querySelector('#registration-map'), { onChange: updateCoordinates });
  document.querySelector('[data-location-confirm]').addEventListener('change', event => { confirmed = event.target.checked; });
  document.querySelector('[data-search-address]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const results = document.querySelector('[data-geocode-results]');
    const query = [register.direccion.value, register.distrito.value, register.provincia.value, 'Perú'].filter(Boolean).join(', ');
    if (!register.direccion.value.trim()) { showMessage('Escribe una dirección antes de buscarla.'); return; }
    button.disabled = true;
    results.replaceChildren();
    try {
      const found = await REAMaps.search(query);
      const locations = Array.isArray(found) ? found : found.data || [];
      if (!locations.length) results.textContent = 'No encontramos esa dirección. Acerca el mapa y selecciona manualmente el punto correcto.';
      locations.slice(0, 5).forEach(item => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'geocode-result';
        choice.textContent = item.display_name || item.nombre || item.label || 'Seleccionar ubicación';
        choice.addEventListener('click', () => {
          const coordinates = { latitud: Number(item.latitud ?? item.lat), longitud: Number(item.longitud ?? item.lon) };
          updateCoordinates(coordinates);
          picker?.setPosition?.(coordinates.latitud, coordinates.longitud);
          picker?.setLatLng?.(coordinates.latitud, coordinates.longitud);
          results.replaceChildren();
        });
        results.append(choice);
      });
    } catch (error) { results.textContent = `${error.message} Puedes seleccionar el punto directamente en el mapa.`; }
    finally { button.disabled = false; }
  });
  register.addEventListener('submit', async event => {
    event.preventDefault();
    if (!register.reportValidity()) return;
    if (register.contrasena.value !== register.confirmacion.value) { showMessage('Las contraseñas no coinciden.'); return; }
    if (!confirmed || !register.latitud.value || !register.longitud.value) { showMessage('Marca tu local en el mapa y marca la casilla que confirma que el punto es correcto.'); return; }
    const button = register.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creando tu cuenta…';
    try {
      const geographic = Object.fromEntries(['direccion', 'departamento', 'provincia', 'distrito', 'referencia'].map(name => [name, register.elements.namedItem(name).value.trim()]));
      const perfil = { ...geographic, latitud: Number(register.latitud.value), longitud: Number(register.longitud.value), ubicacion_confirmada: true, responsable: register.nombre.value.trim() };
      perfil[role === 'donante' ? 'nombre_establecimiento' : 'nombre'] = register.entidad.value.trim();
      await REA.request('/api/auth/register', { method: 'POST', body: { nombre: register.nombre.value.trim(), correo: register.correo.value.trim(), telefono: register.telefono.value.trim(), contrasena: register.contrasena.value, rol: role, perfil } });
      showMessage('Cuenta registrada. Tu perfil está pendiente de verificación administrativa. Ya puedes iniciar sesión para consultar su estado.', true);
      register.hidden = true;
      document.querySelector('[data-registration-success]').hidden = false;
    } catch (error) { showMessage(error.message); }
    finally { button.disabled = false; button.textContent = 'Crear mi cuenta'; }
  });
});
