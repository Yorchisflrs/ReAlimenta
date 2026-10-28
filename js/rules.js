/* Reglas de los formularios para Puno/Perú: filtra lo que se escribe y muestra mensajes claros.
   El servidor vuelve a comprobar lo mismo (server/validation.js); window.REAPuno viene de /js/puno.js. */
(() => {
  const P = window.REAPuno || { PROVINCIAS: {}, TELEFONO: '^(9\\d{8}|051\\d{6})$', NOMBRE: '.*', CORREO_REGISTRO: '.*' };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PERSON = ['nombre', 'responsable', 'responsable_recojo'];
  const WORDS = ['alimento', 'envase', 'transporte_declarado', 'recipiente_declarado', 'direccion', 'direccion_recojo', 'entidad', 'descripcion', 'observaciones', 'referencia', 'motivo'];
  const letters = value => (value.match(/\p{L}/gu) || []).length;

  // Mensaje de error para un campo (cadena vacía = correcto).
  function problem(el) {
    const value = el.value.trim(), name = el.name;
    if (!value) return '';
    if (name === 'telefono') return new RegExp(P.TELEFONO).test(value.replace(/[\s-]/g, '')) ? '' : 'Escribe un celular de 9 dígitos que empiece con 9 (Ej. 951234567) o un fijo de Puno con su código (Ej. 051365000).';
    if (PERSON.includes(name)) {
      if (!new RegExp(P.NOMBRE).test(value)) return 'Escribe solo letras, sin números ni símbolos.';
      if (value.split(/\s+/).filter(part => letters(part) >= 2).length < 2) return 'Escribe nombre y apellido.';
      return '';
    }
    if (name === 'correo' && el.closest('#register-form')) return new RegExp(P.CORREO_REGISTRO).test(value.toLowerCase()) ? '' : 'Usa tu correo Gmail (@gmail.com) o un correo institucional peruano (Ej. @unap.edu.pe, @munipuno.gob.pe).';
    if (name === 'correo') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Escribe un correo válido, Ej. nombre@gmail.com.';
    if (name === 'contrasena' && el.autocomplete === 'new-password') return /\p{L}/u.test(value) && /\d/.test(value) ? '' : 'La contraseña debe tener letras y al menos un número.';
    if (name === 'cantidad') return /^\d{1,6}([.,]\d{1,2})?$/.test(value) && Number(value.replace(',', '.')) > 0 && Number(value.replace(',', '.')) <= 100000 ? '' : 'Escribe solo números, mayor que 0 y hasta 100 000 (Ej. 30 o 2.5).';
    if (WORDS.includes(name)) {
      if (/[<>{}[\]\\|^~`]/.test(value)) return 'No uses los signos < > { } [ ] \\ | ^ ~ `.';
      if (letters(value) < 2) return 'Escribe con palabras, no solo números o símbolos.';
    }
    return '';
  }
  // Muestra el mensaje debajo del campo, sin esperar a que se envíe el formulario.
  function check(el) {
    if (!el.name || !el.setCustomValidity || el.type === 'hidden') return true;
    const message = problem(el);
    el.setCustomValidity(message);
    const label = el.closest('label');
    let note = label?.querySelector('.field-error');
    if (message && label && !note) { note = document.createElement('small'); note.className = 'field-error'; label.append(note); }
    if (note) { note.textContent = message; note.hidden = !message; }
    el.classList.toggle('is-invalid', Boolean(message));
    return !message;
  }

  // Filtrado mientras se escribe: no deja poner letras donde van números ni números en los nombres.
  document.addEventListener('input', event => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement)) return;
    const before = el.value;
    if (el.name === 'telefono') el.value = before.replace(/\D/g, '').slice(0, 9);
    else if (el.name === 'cantidad') el.value = before.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    else if (PERSON.includes(el.name)) el.value = before.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.\- ]/g, '');
    else if (el.name === 'correo') el.value = before.replace(/\s/g, '');
    if (el.validationMessage || el.value !== before) check(el);
  }, true);
  // Al salir del campo se muestra el problema; al enviar se revisan todos antes de que el formulario siga.
  document.addEventListener('focusout', event => { if (event.target.name) check(event.target); });
  document.addEventListener('submit', event => { for (const el of event.target.elements || []) check(el); }, true);
  // Las teclas e, E y + son válidas en los campos numéricos del navegador, pero no en una temperatura.
  document.addEventListener('keydown', event => { if (event.target.name === 'temperatura_c' && ['e', 'E', '+'].includes(event.key)) event.preventDefault(); });

  // Provincias y distritos del departamento de Puno.
  const options = (list, current, placeholder) => `<option value="">${placeholder}</option>${list.map(v => `<option ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
  const provinceOptions = current => options(Object.keys(P.PROVINCIAS), current, 'Elige la provincia');
  const districtOptions = (provincia, current) => options(P.PROVINCIAS[provincia] || [], current, provincia ? 'Elige el distrito' : 'Primero elige la provincia');
  // Para donaciones: todos los distritos, agrupados por provincia.
  const allDistrictOptions = current => `<option value="">Elige el distrito</option>${Object.entries(P.PROVINCIAS).map(([prov, list]) => `<optgroup label="${esc(prov)}">${list.map(v => `<option ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('')}</optgroup>`).join('')}`;
  document.addEventListener('change', event => {
    if (event.target.name !== 'provincia' || event.target.tagName !== 'SELECT') return;
    const district = event.target.form?.elements.namedItem('distrito');
    if (district) district.innerHTML = districtOptions(event.target.value, '');
  });

  window.REARules = { check, problem, provinceOptions, districtOptions, allDistrictOptions };
})();
