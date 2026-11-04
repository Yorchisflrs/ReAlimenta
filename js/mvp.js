/* REAlimenta MVP: los registros, decisiones y evaluaciones provienen de la API. */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = value => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(value)) : 'No declarada';
  const normalized = value => String(value || '').toLowerCase().replaceAll(' ', '_');
  const labels = { disponible: 'Disponible', en_proceso: 'En proceso', cancelada: 'Cancelada', vencida: 'Vencida', expirada: 'Vencida', finalizada: 'Finalizada', pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada', en_revision: 'En revisión', verificado: 'Verificado', verificada: 'Verificada' };
  const label = value => labels[normalized(value)] || String(value || 'Sin información');
  const badge = value => `<span class="mvp-badge status-${escape(normalized(value))}"><span></span>${escape(label(value))}</span>`;
  const empty = (title, text, action = '') => `<div class="mvp-empty"><span class="empty-icon"><i class="fa-solid fa-seedling"></i></span><h2>${title}</h2><p>${text}</p>${action}</div>`;
  const action = (text, name, extra = '', cls = 'btn-secondary') => `<button class="btn ${cls}" type="button" data-action="${name}" ${extra}>${text}</button>`;
  const heading = (title, text, buttons = '') => `<div class="page-header mvp-page-header"><div><span class="section-kicker">TU COMUNIDAD, MEJOR CONECTADA</span><h1>${escape(title)}</h1><p>${escape(text)}</p></div><div class="header-actions">${buttons}</div></div>`;
  const pair = (name, value) => `<div class="mvp-pair"><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`;
  const FOOD_TYPES = window.REAPuno?.TIPOS_ALIMENTO || [];
  const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'RE';
  // Foto de perfil (fachada o logo); sin foto se muestran las iniciales del nombre.
  const profilePhoto = (url, name, size = '') => `<span class="profile-photo ${size}">${url ? `<img src="${escape(url)}" alt="Foto de ${escape(name)}" loading="lazy">` : `<span>${escape(initials(name))}</span>`}</span>`;
  const readBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('No se pudo leer la foto. Elige otra imagen.')); reader.readAsDataURL(file); });
  const role = document.body.dataset.role;
  const state = { user: null, profile: {}, donations: [], requests: [], stats: {}, current: 'dashboard', selected: null, selectedRequest: null, evaluations: new Map(), filters: { q: '', categoria: '', distrito: '', estado: '' } };
  const main = $('#main-content');
  const dialog = $('#app-dialog');
  let picker = null;
  let etaMap = null;
  let lastFocus = null;
  function toast(message) {
    const item = document.createElement('div');
    item.className = 'mvp-toast';
    const icon = document.createElement('i'); icon.className = 'fa-solid fa-circle-check';
    const text = document.createElement('span'); text.textContent = message;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Cerrar aviso'); close.addEventListener('click', () => item.remove());
    item.append(icon, text, close); $('.toast-container').append(item);
    setTimeout(() => item.remove(), 6500);
  }
  function showError(error, container = $('[data-form-error]')) {
    if (!container) { toast(error.message); return; }
    container.hidden = false;
    container.textContent = error.message;
    container.focus();
  }
  function openDialog(title, html) {
    lastFocus = document.activeElement;
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = html;
    dialog.showModal();
  }
  function closeDialog() { dialog.close(); lastFocus?.focus(); }
  $('[data-close-dialog]')?.addEventListener('click', closeDialog);
  dialog?.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
  function closeSidebar() { $('#app-sidebar').classList.remove('open'); $('[data-sidebar-overlay]').classList.remove('open'); document.body.classList.remove('sidebar-open'); }
  $('[data-sidebar-open]')?.addEventListener('click', () => { $('#app-sidebar').classList.add('open'); $('[data-sidebar-overlay]').classList.add('open'); document.body.classList.add('sidebar-open'); });
  $('[data-sidebar-close]')?.addEventListener('click', closeSidebar);
  $('[data-sidebar-overlay]')?.addEventListener('click', closeSidebar);
  async function loadData() {
    state.evaluations.clear();
    const query = role === 'donante' ? '?scope=mine' : '?scope=all';
    const [donations, requests, stats] = await Promise.all([
      REA.request(`/api/donaciones${query}`), REA.request('/api/solicitudes'), REA.request('/api/public/stats')
    ]);
    state.donations = donations.data || [];
    state.requests = requests.data || [];
    state.stats = stats.data || stats;
  }
  function identity() {
    const profile = state.profile;
    const name = profile.nombre_establecimiento || profile.nombre || state.user.nombre;
    $('[data-account-name]').textContent = name;
    $('[data-user-name]').textContent = state.user.nombre;
    const avatar = $('[data-avatar]');
    if (profile.foto_url) avatar.innerHTML = `<img src="${escape(profile.foto_url)}" alt="">`;
    else avatar.textContent = initials(state.user.nombre);
    $('[data-account-status]').textContent = `${state.user.es_demostracion ? 'Cuenta de prueba · ' : ''}${role === 'administrador' ? 'Administración de la plataforma' : `${label(profile.estado_verificacion || 'pendiente')} · ${profile.distrito || 'Ubicación pendiente'}`}`;
  }
  function setContent(html, title) {
    window.REAMaps?.dispose(main);
    window.REAImages?.dispose(main);
    picker?.destroy?.(); picker = null; etaMap = null;
    main.innerHTML = html;
    window.REAAmbience?.apply(state.current,role);
    window.REAPresentation?.enhance(main,state);
    $('[data-breadcrumb]').textContent = title;
    document.title = `${title} | REAlimenta`;
    $$('.sidebar-nav [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === state.current || (state.current === 'detalle' && ['mis-donaciones', 'donaciones', 'disponibles'].includes(button.dataset.view))));
    if (role !== 'administrador' && normalized(state.profile.estado_verificacion) !== 'verificado' && normalized(state.profile.estado_verificacion) !== 'verificada') {
      main.insertAdjacentHTML('afterbegin', '<div class="mvp-message warning account-warning"><i class="fa-solid fa-hourglass-half"></i> Tu cuenta está pendiente de verificación. Puedes completar tu perfil; la publicación y las solicitudes requieren una cuenta verificada.</div>');
    }
  }
  async function navigate(view, options = {}) {
    // La viabilidad temporal siempre se vuelve a consultar al servidor.
    if (view !== 'detalle') state.evaluations.clear();
    state.current = view;
    closeSidebar();
    history.replaceState(null, '', `#${view}`);
    if (view === 'dashboard') renderDashboard();
    else if (['mis-donaciones', 'disponibles', 'donaciones'].includes(view)) renderDonations();
    else if (view === 'nueva-donacion') renderDonationForm();
    else if (view === 'solicitudes') renderRequests();
    else if (view === 'detalle') await renderDetail(options.id || state.selected?.id_donacion, options.request || null);
    else if (view === 'perfil' || view === 'establecimiento' || view === 'organizacion') { state.profileEditing = false; await renderProfile(); }
    else if (view === 'auditoria') await renderAudit();
    else if (view === 'seguimiento' || view === 'incidencias') await REACustody.render(view);
    else renderPending(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const metric = (icon, value, title, note = '') => `<article class="mvp-metric"><span class="metric-icon"><i class="fa-solid ${icon}"></i></span><span class="metric-note">${note}</span><strong>${escape(value)}</strong><h2>${title}</h2></article>`;
  function renderDashboard() {
    const available = state.donations.filter(item => normalized(item.estado) === 'disponible');
    const process = state.donations.filter(item => normalized(item.estado) === 'en_proceso');
    const pending = state.requests.filter(item => normalized(item.estado) === 'pendiente');
    const accepted = state.requests.filter(item => normalized(item.estado) === 'aceptada');
    const name = (state.user.nombre || '').split(' ')[0];
    const donor = role === 'donante';
    const title = role === 'administrador' ? 'El pulso de nuestra red.' : `Hola, ${name}. Cada alimento cuenta.`;
    const metrics = role === 'administrador'
      ? metric('fa-users', state.stats.usuarios ?? '—', 'Usuarios registrados', 'Base de datos') + metric('fa-store', state.stats.donantes ?? '—', 'Donantes', 'En la red') + metric('fa-people-roof', state.stats.organizaciones ?? '—', 'Beneficiarias', 'En la red') + metric('fa-box-open', state.donations.length, 'Donaciones', 'Registros reales')
      : donor ? metric('fa-box-open', state.donations.length, 'Donaciones registradas', 'Tu contribución') + metric('fa-seedling', available.length, 'Donaciones disponibles', 'Esperan una oportunidad') + metric('fa-inbox', pending.length, 'Solicitudes pendientes', 'Por revisar') + metric('fa-arrows-rotate', process.length, 'Donaciones en proceso', 'Ya tienen destinatario')
      : metric('fa-basket-shopping', available.length, 'Donaciones disponibles', 'Explora la red') + metric('fa-paper-plane', state.requests.length, 'Mis solicitudes', 'Historial completo') + metric('fa-circle-check', accepted.length, 'Solicitudes aceptadas', 'Listas para coordinar') + metric('fa-clock', pending.length, 'Pendientes de respuesta', 'En manos del donante');
    const alertDonations = available.filter(d => new Date(d.fecha_limite_recojo).getTime() - Date.now() < 4 * 3600000);
    const cards = available.slice(0, role === 'organizacion' ? 3 : 2).map(donationCard).join('');
    setContent(`${heading(title, 'Una vista clara de tus donaciones, solicitudes y nuevas oportunidades.', donor ? action('<i class="fa-solid fa-plus"></i> Publicar donación', 'navigate', 'data-target="nueva-donacion"', 'btn-primary') : action(role === 'administrador' ? 'Consultar donaciones' : '<i class="fa-solid fa-magnifying-glass"></i> Buscar donaciones', 'navigate', `data-target="${role === 'administrador' ? 'donaciones' : 'disponibles'}"`, 'btn-primary'))}
      <div class="mvp-metrics">${metrics}</div>
      <div class="mvp-feature-banner"><div><span class="small-kicker">DE LA DISPONIBILIDAD A LA OPORTUNIDAD</span><h2>Una buena conexión<br>empieza con una ruta clara.</h2><p>Mira dónde se recoge cada alimento y coordina el horario con la otra parte.</p>${action('Explorar donaciones <i class="fa-solid fa-arrow-right"></i>', 'navigate', `data-target="${donor ? 'mis-donaciones' : role === 'administrador' ? 'donaciones' : 'disponibles'}"`, 'btn-light')}</div><div class="route-illustration" aria-hidden="true"><span class="illustration-pin origin"><i class="fa-solid fa-store"></i></span><span class="illustration-road"></span><span class="illustration-pin destination"><i class="fa-solid fa-people-roof"></i></span><span class="illustration-label">Una red. Más posibilidades.</span></div></div>
      <div class="mvp-dashboard-grid"><article class="mvp-panel"><div class="panel-heading"><div><span class="section-kicker">MOVIMIENTO EN TU RED</span><h2>${donor ? 'Solicitudes recientes' : 'Tus últimas solicitudes'}</h2></div>${action('Ver todas <i class="fa-solid fa-arrow-right"></i>', 'navigate', 'data-target="solicitudes"', 'btn-text')}</div>${state.requests.length ? `<div class="compact-requests">${state.requests.slice(0, 4).map(r => `<button class="compact-request" type="button" data-action="request-detail" data-id="${r.id_solicitud}"><span class="compact-icon"><i class="fa-solid fa-box-open"></i></span><span><strong>${escape(r.donacion?.alimento || 'Donación')}</strong><small>${escape(r.organizacion?.nombre || r.donante?.nombre_establecimiento || `Solicitud #${r.id_solicitud}`)}</small></span>${badge(r.estado)}<i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>` : empty('Las buenas conexiones están por llegar', donor ? 'Tus solicitudes aparecerán aquí cuando una beneficiaria se interese en tu donación.' : 'Busca una donación y envía tu primera solicitud.')}</article><aside class="mvp-panel"><div class="panel-heading"><div><span class="section-kicker">PARA TENER EN CUENTA</span><h2>Planifica con información</h2></div><span class="round-icon"><i class="fa-regular fa-lightbulb"></i></span></div><div class="insight-item"><span class="insight-icon amber"><i class="fa-regular fa-clock"></i></span><div><strong>${alertDonations.length ? `${alertDonations.length} donación(es) con recojo próximo` : 'Cada ventana de recojo importa'}</strong><p>${alertDonations.length ? 'Hay publicaciones con menos de cuatro horas hasta su límite de recojo.' : 'Revisa disponibilidad, conservación y horarios antes de enviar o aceptar una solicitud.'}</p></div></div><div class="insight-item"><span class="insight-icon"><i class="fa-solid fa-route"></i></span><div><strong>Tiempo de llegada declarado</strong><p>Al solicitar, la beneficiaria indica cuánto tardará en llegar; el donante lo ve antes de aceptar.</p></div></div><div class="responsibility-note"><i class="fa-solid fa-circle-info"></i><p>La información alimentaria es declarada. REAlimenta no certifica inocuidad ni monitorea temperatura.</p></div></aside></div>
      ${role !== 'administrador' ? `<div class="section-row"><div><span class="section-kicker">ALIMENTOS CON UNA NUEVA OPORTUNIDAD</span><h2>${donor ? 'Tus publicaciones disponibles' : 'Descubre lo que puedes aprovechar'}</h2></div></div><div class="mvp-donation-grid">${cards || empty('Sin publicaciones disponibles', donor ? 'Publica un alimento para comenzar.' : 'Vuelve pronto para consultar nuevas publicaciones.')}</div>` : `<div class="mvp-message neutral"><i class="fa-solid fa-database"></i> Los conteos provienen de los registros de MySQL. Seguimiento, custodia e incidencias operan con registros persistentes. Verificaciones documentales y reportes avanzados continúan pendientes.</div>`}`, 'Vista general');
  }
  function remaining(value) {
    if (!value) return 'Límite no declarado';
    const minutes = Math.floor((new Date(value) - Date.now()) / 60000);
    if (minutes <= 0) return 'Ventana declarada finalizada';
    return minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min disponibles` : `${minutes} min disponibles`;
  }
  function foodVisual(category) {
    const c = String(category || '').toLowerCase();
    return c.includes('pan') ? ['bread', 'fa-bread-slice', 'Del horno a otra mesa.'] : c.includes('verd') || c.includes('frut') ? ['vegetable', 'fa-carrot', 'Más vida, menos desperdicio.'] : c.includes('láct') || c.includes('lact') ? ['dairy', 'fa-bottle-water', 'Una oportunidad de ayudar.'] : c.includes('abarrote') ? ['bread', 'fa-wheat-awn', 'Lo básico también se comparte.'] : c.includes('conserva') ? ['fruit', 'fa-jar', 'Guardado para compartir.'] : c.includes('carne') ? ['prepared', 'fa-drumstick-bite', 'Una oportunidad de ayudar.'] : ['prepared', 'fa-bowl-food', 'Un alimento. Un nuevo destino.'];
  }
  // Editar y eliminar solo mientras ninguna beneficiaria la haya solicitado (el servidor vuelve a comprobarlo).
  const untouched = d => !Number(d.solicitudes_count) && !(d.solicitudes || []).length;
  const ownerActions = d => role !== 'donante' ? '' : `${normalized(d.estado) === 'disponible' && untouched(d) ? action('<i class="fa-regular fa-pen-to-square"></i> Editar', 'edit', `data-id="${d.id_donacion}"`) : ''}${untouched(d) ? action('<i class="fa-regular fa-trash-can"></i> Eliminar', 'delete-donation', `data-id="${d.id_donacion}"`, 'btn-danger-outline') : ''}`;
  function donationCard(d) {
    const [tone, icon, caption] = foodVisual(d.categoria);
    const donorName = d.donante_nombre || d.donante?.nombre_establecimiento || state.profile.nombre_establecimiento || 'Establecimiento donante';
    const donorPhoto = role === 'donante' ? state.profile.foto_url : d.donante?.foto_url;
    return `<article class="mvp-donation-card"><div class="food-visual ${tone}"><div class="food-visual-rings"></div><span class="food-category">${escape(d.categoria)}</span><i class="fa-solid ${icon}" aria-hidden="true"></i><span class="food-caption">${caption}</span>${d.requiere_cadena_frio ? '<span class="cold-tag"><i class="fa-solid fa-snowflake"></i> Cadena de frío</span>' : ''}</div><div class="donation-card-body"><div class="card-title-row"><h2>${escape(d.alimento)}</h2>${badge(d.estado)}</div><p class="donation-by">${profilePhoto(donorPhoto, donorName, 'xs')}<span>${escape(donorName)}</span></p><div class="donation-key-facts"><strong>${number(d.cantidad)} <span>${escape(d.unidad)}</span></strong><span><i class="fa-solid fa-location-dot"></i> ${escape(d.distrito || d.donante?.distrito || 'Puno')}</span></div><div class="card-time"><i class="fa-regular fa-clock"></i><span>${remaining(d.fecha_limite_aprovechamiento_declarada || d.fecha_limite_recojo)}</span></div><p class="card-conservation"><i class="fa-solid fa-temperature-half"></i> ${escape(d.conservacion_declarada || 'Conservación no indicada')}</p><div class="donation-card-actions">${action('Ver detalles', 'detail', `data-id="${d.id_donacion}"`, 'btn-primary')}${role === 'donante' ? ownerActions(d) : action('<i class="fa-solid fa-map-location-dot"></i> Ver en el mapa', 'route', `data-id="${d.id_donacion}"`, 'btn-secondary')}</div></div></article>`;
  }
  function filteredDonations() {
    const f = state.filters;
    return state.donations.filter(d => (!f.q || `${d.alimento} ${d.donante_nombre || ''} ${d.descripcion || ''}`.toLocaleLowerCase('es').includes(f.q.toLocaleLowerCase('es'))) && (!f.categoria || d.categoria === f.categoria) && (!f.distrito || String(d.distrito || d.donante?.distrito || '').toLowerCase().includes(f.distrito.toLowerCase())) && (!f.estado || normalized(d.estado) === f.estado));
  }
  function renderDonations() {
    const donor = role === 'donante';
    const categories = FOOD_TYPES;
    setContent(`${heading(donor ? 'Comparte alimentos. Multiplica oportunidades.' : role === 'administrador' ? 'Donaciones de la red' : 'Encuentra alimentos con un nuevo destino.', donor ? 'Gestiona tus publicaciones y las solicitudes que reciben.' : 'Explora las condiciones declaradas y planifica el traslado antes de solicitar.', donor ? action('<i class="fa-solid fa-plus"></i> Publicar donación', 'navigate', 'data-target="nueva-donacion"', 'btn-primary') : '')}<div class="mvp-filter-panel"><label class="search-field"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-filter="q" value="${escape(state.filters.q)}" placeholder="Buscar alimento o establecimiento" aria-label="Buscar alimento o establecimiento"></label><label class="sr-only" for="filter-category">Tipo de alimento</label><select id="filter-category" data-filter="categoria" aria-label="Tipo de alimento"><option value="">Tipo de alimento: todos</option>${categories.map(c => `<option ${state.filters.categoria === c ? 'selected' : ''}>${escape(c)}</option>`).join('')}</select><label class="sr-only" for="filter-district">Distrito</label><input id="filter-district" data-filter="distrito" value="${escape(state.filters.distrito)}" placeholder="Distrito" aria-label="Filtrar por distrito">${role !== 'organizacion' ? `<select data-filter="estado" aria-label="Estado"><option value="">Todos los estados</option>${['disponible', 'en_proceso', 'finalizada', 'expirada', 'cancelada'].map(s => `<option value="${s}" ${state.filters.estado === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>` : ''}${action('<i class="fa-solid fa-rotate"></i>', 'refresh', 'aria-label="Actualizar donaciones"', 'btn-icon btn-secondary')}</div><div class="results-line"><strong data-results-count></strong><span>Información declarada por los donantes</span></div><div class="mvp-donation-grid" data-donation-results></div>`, donor ? 'Mis donaciones' : 'Donaciones');
    updateDonationResults();
  }
  function updateDonationResults() {
    const visible = filteredDonations();
    $('[data-results-count]').textContent = `${visible.length} ${visible.length === 1 ? 'donación encontrada' : 'donaciones encontradas'}`;
    $('[data-donation-results]').innerHTML = visible.map(donationCard).join('') || empty('Por ahora, no hay coincidencias', 'Prueba otra búsqueda o cambia los filtros.');
    window.REAPresentation?.decorate(main,state);
  }
  async function renderDetail(id, request = null) {
    if (!id) { await navigate(role === 'donante' ? 'mis-donaciones' : 'disponibles'); return; }
    const result = await REA.request(`/api/donaciones/${id}`);
    state.selected = result.data;
    state.selectedRequest = request;
    const d = state.selected;
    const donor = role === 'donante';
    const related = d.solicitudes || state.requests.filter(r => String(r.id_donacion || r.donacion?.id_donacion) === String(id));
    for (const request of related) { const index = state.requests.findIndex(r => String(r.id_solicitud) === String(request.id_solicitud)); if (index < 0) state.requests.push(request); else state.requests[index] = request; }
    const editable = donor && normalized(d.estado) === 'disponible' && !related.some(r => ['pendiente', 'aceptada'].includes(normalized(r.estado)));
    const cancelable = donor && ['disponible', 'en_proceso'].includes(normalized(d.estado));
    const canRequest = role === 'organizacion' && normalized(d.estado) === 'disponible';
    setContent(`${heading(d.alimento, `${d.categoria} · Publicación #${d.id_donacion}`, action('<i class="fa-solid fa-arrow-left"></i> Volver', 'navigate', `data-target="${donor ? 'mis-donaciones' : role === 'administrador' ? 'donaciones' : 'disponibles'}"`))}<div class="mvp-detail-layout"><div class="detail-main"><article class="mvp-panel detail-summary"><div class="card-title-row"><span class="section-kicker">INFORMACIÓN DE LA DONACIÓN</span>${badge(d.estado)}</div><div class="detail-quantity">${number(d.cantidad)} <span>${escape(d.unidad)}</span></div><p>${escape(d.descripcion || 'Sin descripción adicional.')}</p><dl class="mvp-definition-grid">${pair('Donante', d.donante_nombre || d.donante?.nombre_establecimiento || 'Establecimiento')}${pair('Disponible desde', date(d.fecha_disponibilidad))}${pair('Límite de recojo', date(d.fecha_limite_recojo))}${pair('Límite de aprovechamiento declarado', date(d.fecha_limite_aprovechamiento_declarada))}${pair('Dirección de recojo', d.direccion_recojo)}${pair('Solicitudes recibidas', d.solicitudes_count ?? related.length)}</dl>${d.donante?.es_demostracion ? '<div class="mvp-message neutral demo-location-note"><i class="fa-solid fa-flask"></i> Ubicación de demostración: el marcador corresponde a un punto público de Puno; no a un establecimiento real.</div>' : ''}${donor && !editable && normalized(d.estado) === 'disponible' ? '<p class="small-muted">La edición se bloquea mientras existan solicitudes activas. Si cambiaron las condiciones, puedes cancelar con un motivo.</p>' : ''}<div class="detail-actions">${editable ? action('<i class="fa-regular fa-pen-to-square"></i> Editar donación', 'edit', `data-id="${id}"`) : ''}${cancelable ? action('Cancelar donación', 'cancel-donation', `data-id="${id}"`, 'btn-danger-outline') : ''}${donor && untouched(d) ? action('<i class="fa-regular fa-trash-can"></i> Eliminar', 'delete-donation', `data-id="${id}"`, 'btn-danger-outline') : ''}${canRequest ? action('<i class="fa-solid fa-paper-plane"></i> Solicitar donación', 'new-request', `data-id="${id}"`, 'btn-primary') : ''}</div></article><article class="mvp-panel conservation-panel"><div class="panel-heading"><h2><i class="fa-solid fa-temperature-half"></i> Condiciones declaradas de conservación</h2></div><dl class="mvp-definition-grid">${pair('Conservación', d.conservacion_declarada || 'No declarada')}${pair('Cadena de frío', d.requiere_cadena_frio ? 'Requerida por el donante' : 'No declarada como requerida')}${pair('Envase', d.envase || 'No declarado')}${pair('Temperatura declarada', d.temperatura_declarada || 'No indicada')}${pair('Observaciones de conservación y transporte', d.observaciones || 'Sin observaciones adicionales')}</dl><div class="responsibility-note"><i class="fa-solid fa-circle-info"></i><p>Las condiciones de conservación no han sido verificadas por REAlimenta. REAlimenta no certifica la inocuidad del alimento.</p></div></article></div><aside>${!donor ? placeCard('¿QUIÉN DONA?', d.donante?.nombre_establecimiento || d.donante_nombre, d.donante?.foto_url, [d.donante?.direccion, d.donante?.referencia && `Ref.: ${d.donante.referencia}`, d.donante?.distrito].filter(Boolean).join(' · '), 'Usa la foto para reconocer el local cuando vayas a recoger.') : request?.organizacion ? placeCard('¿QUIÉN LO RECIBE?', request.organizacion.nombre, request.organizacion.foto_url, [request.organizacion.tipo_organizacion, request.organizacion.direccion, request.organizacion.distrito].filter(Boolean).join(' · '), request.tiempo_llegada_min ? `Dice que tardará unos ${number(request.tiempo_llegada_min)} min en llegar al lugar de recojo.` : 'Así puedes reconocer a la beneficiaria que pidió tu donación.') : ''}<article class="mvp-panel detail-side-panel"><span class="section-kicker">LUGAR DE RECOJO</span><h2>¿Dónde y hasta cuándo?</h2><div class="location-steps"><div><span class="location-dot orange"></span><small>DIRECCIÓN</small><strong>${escape(d.direccion_recojo)}</strong></div><div><span class="location-dot"></span><small>SE PUEDE RECOGER HASTA</small><strong>${date(d.fecha_limite_recojo)}</strong></div></div>${role === 'organizacion' ? action('<i class="fa-solid fa-map-location-dot"></i> Ver en el mapa', 'scroll-route', '', 'btn-primary') : ''}${donor ? action('<i class="fa-solid fa-file-pdf"></i> Descargar comprobante (PDF)', 'download-receipt', '', 'btn-secondary receipt-button') : ''}</article>${related.length ? `<article class="mvp-panel"><span class="section-kicker">SOLICITUDES VINCULADAS</span><h2>${related.length} ${related.length === 1 ? 'beneficiaria interesada' : 'solicitudes registradas'}</h2>${related.map(r => `<button class="request-route-choice ${String(r.id_solicitud) === String(request?.id_solicitud) ? 'selected' : ''}" type="button" data-action="select-route-request" data-id="${r.id_solicitud}">${profilePhoto(r.organizacion?.foto_url, r.organizacion?.nombre, 'sm')}<span class="request-choice-name"><strong>${escape(r.organizacion?.nombre || `Solicitud #${r.id_solicitud}`)}</strong><small><i class="fa-regular fa-clock"></i> Llegaría en ${escape(arrivalText(r.tiempo_llegada_min))}</small></span>${badge(r.estado)}</button>`).join('')}</article>` : ''}</aside></div>${role === 'organizacion' ? `<section class="mvp-panel route-workspace" id="route-workspace"><div class="panel-heading"><div><span class="section-kicker">UBICACIÓN</span><h2>¿Dónde se recoge?</h2><p class="small-muted">Mira en el mapa dónde está el lugar de recojo y cuánto te queda de camino. Al hacer tu solicitud, indica cuánto tardarás en llegar según cómo vas a ir (combi, mototaxi, a pie): el donante lo verá.</p></div></div><div class="map-surface route-map" id="delivery-map"></div><p class="field-hint"><i class="fa-solid fa-circle-info"></i> <strong>A</strong>: tu local · <strong>B</strong>: lugar de recojo. Puedes tocar el mapa para mover A si saldrás desde otro lugar.</p></section>` : ''}${donor || role === 'administrador' ? `<div class="detail-bottom-actions">${action('Ver todas las solicitudes <i class="fa-solid fa-arrow-right"></i>', 'navigate', 'data-target="solicitudes"')}</div>` : ''}`, 'Detalle de donación');
    mountEtaMap();
  }
  // Foto grande del local (fachada o logo) para reconocerlo al llegar.
  function placeCard(kicker, name, photoUrl, address, hint) {
    return `<article class="mvp-panel place-card"><span class="section-kicker">${kicker}</span>${photoUrl ? `<img class="place-photo" src="${escape(photoUrl)}" alt="Fachada o logo de ${escape(name)}" loading="lazy">` : `<div class="place-photo empty"><i class="fa-solid fa-store"></i><span>Todavía no subió la foto de su local.</span></div>`}<h2>${escape(name || 'Sin nombre')}</h2>${address ? `<p><i class="fa-solid fa-location-dot"></i> ${escape(address)}</p>` : ''}${hint ? `<p class="small-muted">${escape(hint)}</p>` : ''}</article>`;
  }
  function viabilityLabel(value) {
    const v = normalized(value);
    if (v.includes('no_viable') || v === 'rojo') return 'No viable según el tiempo declarado';
    if (v.includes('reducido') || v === 'amarillo' || v === 'precaucion') return 'Margen de tiempo reducido';
    if (v === 'viable' || v === 'verde') return 'Traslado logísticamente viable';
    return 'Información insuficiente';
  }
  function renderEvaluation(result) {
    const e = result?.evaluacion;
    const raw = normalized(e?.estado_viabilidad);
    const tone = !e ? 'gris' : raw.includes('no_viable') || raw === 'rojo' ? 'rojo' : raw.includes('reducido') || raw === 'amarillo' || raw === 'precaucion' ? 'amarillo' : raw === 'viable' || raw === 'verde' ? 'verde' : 'gris';
    const percent = e && Number(e.tiempo_restante_min) > 0 ? Math.max(0, Math.min(100, Number(e.tiempo_total_estimado_min) / Number(e.tiempo_restante_min) * 100)) : 0;
    return `<div class="feasibility-panel tone-${tone}"><div class="feasibility-heading"><span class="traffic-light"><i class="${tone === 'verde' ? 'active' : ''}"></i><i class="${tone === 'amarillo' ? 'active' : ''}"></i><i class="${tone === 'rojo' ? 'active' : ''}"></i></span><div><small>SEMÁFORO DE VIABILIDAD LOGÍSTICA Y TEMPORAL</small><h3>${e ? viabilityLabel(e.estado_viabilidad) : 'Información insuficiente'}</h3><p>${escape(e?.mensaje || 'No es posible evaluar todavía la viabilidad del recorrido. Calcula una ruta con las ubicaciones y los tiempos de planificación.')}</p></div></div>${e ? `<div class="evaluation-values"><div><small>Distancia estimada</small><strong>${result.ruta?.distancia_km != null ? number(result.ruta.distancia_km) + ' km' : 'No disponible'}</strong></div><div><small>Duración por carretera</small><strong>${result.ruta?.duracion_estimada_min != null ? number(result.ruta.duracion_estimada_min) + ' min' : 'No disponible'}</strong></div><div><small>Tiempo declarado disponible</small><strong>${e.tiempo_restante_min != null ? number(e.tiempo_restante_min) + ' min' : 'No declarado'}</strong></div><div><small>Tiempo total estimado</small><strong>${e.tiempo_total_estimado_min != null ? number(e.tiempo_total_estimado_min) + ' min' : 'No disponible'}</strong></div><div><small>Margen restante</small><strong>${e.margen_tiempo_min != null ? number(e.margen_tiempo_min) + ' min' : 'No disponible'}</strong></div></div><div class="time-progress" role="progressbar" aria-label="Proporción del tiempo disponible requerida para el traslado" aria-valuenow="${Math.round(percent)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></div>${e.advertencias?.length ? `<ul class="evaluation-warnings">${e.advertencias.map(w => `<li>${escape(w)}</li>`).join('')}</ul>` : ''}` : ''}<p class="evaluation-footnote"><i class="fa-solid fa-circle-info"></i> Evaluación logística preliminar. No constituye una certificación sanitaria.</p></div>`;
  }
  function displayRoute() {}
  // Mapa de referencia para la beneficiaria: B es el lugar de recojo y A su local. No se calcula la ruta:
  // el tiempo real depende de cómo vaya (combi, mototaxi, a pie) y lo declara ella al solicitar.
  function mountEtaMap() {
    const d = state.selected;
    if (!$('#delivery-map') || !window.REAMaps) return;
    const own = state.profile;
    const start = own?.latitud != null && own?.longitud != null ? own : null;
    etaMap = REAMaps.mountEta($('#delivery-map'), { destination: { latitud: d.latitud_recojo, longitud: d.longitud_recojo }, start });
  }
  const arrivalText = minutes => minutes ? `${number(minutes)} min` : 'No indicado';
  function localInputDate(value, addHours = 0) {
    const d = value ? new Date(value) : new Date(Date.now() + addHours * 3600000);
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(' ', 'T');
  }
  function geographicFields(p, forDonation = false) {
    // Las coordenadas las completa el mapa: se guardan en campos ocultos para no mostrar datos técnicos.
    return `<div class="geographic-fields form-grid">${forDonation ? '' : `<label>Departamento<input class="form-control" name="departamento" value="Puno" readonly><small class="field-hint">REAlimenta funciona en el departamento de Puno.</small></label><label>Provincia<select class="form-control" name="provincia" required>${REARules.provinceOptions(p.provincia || 'Puno')}</select></label>`}<label>Distrito<select class="form-control" name="distrito" required>${forDonation ? REARules.allDistrictOptions(p.distrito || '') : REARules.districtOptions(p.provincia || 'Puno', p.distrito || '')}</select></label><label class="${forDonation ? '' : 'full'}">${forDonation ? '¿Dónde se recoge?' : 'Dirección'}<input class="form-control" name="${forDonation ? 'direccion_recojo' : 'direccion'}" value="${escape(p.direccion_recojo || p.direccion || '')}" required maxlength="255" placeholder="Ej. Jr. Lima 123"></label><label class="full">Referencia (opcional)<input class="form-control" name="referencia" value="${escape(p.referencia || '')}" maxlength="200" placeholder="Ej. Frente al parque Pino, puerta verde"><small class="field-hint">Un lugar conocido cerca, para que te encuentren fácil.</small></label><input type="hidden" name="${forDonation ? 'latitud_recojo' : 'latitud'}" value="${escape(p.latitud_recojo ?? p.latitud ?? '')}"><input type="hidden" name="${forDonation ? 'longitud_recojo' : 'longitud'}" value="${escape(p.longitud_recojo ?? p.longitud ?? '')}"></div>${forDonation ? '<p class="field-hint map-steps"><i class="fa-solid fa-circle-info"></i> El marcador empieza en la dirección de tu local. Si el alimento se recoge en otro lugar, toca el mapa o arrastra el marcador hasta el punto exacto.</p>' : `<p class="field-hint map-steps"><i class="fa-solid fa-circle-info"></i> Escribe la dirección y pulsa <strong>Buscar en el mapa</strong>. Si el punto no es exacto, toca el mapa o mueve el marcador hasta el lugar correcto.</p><div class="map-search-actions">${action('<i class="fa-solid fa-magnifying-glass-location"></i> Buscar en el mapa', 'search-address')}</div><div data-geocode-results class="geocode-results"></div>`}<div class="map-surface location-map" id="location-map"></div><label class="check-row location-confirm"><input type="checkbox" name="ubicacion_confirmada" ${p.latitud != null || p.latitud_recojo != null ? 'checked' : ''} required><span>El marcador del mapa está en ${forDonation ? 'el lugar donde se recoge el alimento' : 'mi local'}.</span></label>`;
  }
  function mountLocation(form, p = {}, forDonation = false) {
    if (!window.REAMaps) return;
    const latName = forDonation ? 'latitud_recojo' : 'latitud';
    const lngName = forDonation ? 'longitud_recojo' : 'longitud';
    picker = REAMaps.mountPicker($('#location-map'), { latitud: p[latName] ?? p.latitud, longitud: p[lngName] ?? p.longitud, onChange: point => { const lat = Number(point.latitud).toFixed(6), lng = Number(point.longitud).toFixed(6); const moved = Number(form.elements.namedItem(latName).value).toFixed(6) !== lat || Number(form.elements.namedItem(lngName).value).toFixed(6) !== lng; form.elements.namedItem(latName).value = lat; form.elements.namedItem(lngName).value = lng; /* Colocar el marcador guardado al abrir no cuenta como cambio. */ if (moved) form.ubicacion_confirmada.checked = false; } });
    for(const name of ['direccion','direccion_recojo','distrito'])form.elements.namedItem(name)?.addEventListener('input',()=>{form.ubicacion_confirmada.checked=false;});
  }
  function renderDonationForm(d = null) {
    const editing = Boolean(d);
    const p = d || state.profile;
    const field = (label, name, type = 'text', value = '', extra = '', hint = '') => `<label>${label}<input class="form-control" name="${name}" type="${type}" value="${escape(value)}" ${extra}>${hint ? `<small class="field-hint">${hint}</small>` : ''}</label>`;
    // [valor guardado, texto que ve el donante]: se conservan los valores para no alterar registros existentes.
    const choices = (list, current) => [...list, ...(current && !list.some(([v]) => v === current) ? [[current, current]] : [])].map(([v, text]) => `<option value="${escape(v)}" ${current === v ? 'selected' : ''}>${escape(text)}</option>`).join('');
    const categories = FOOD_TYPES.map(type => [type, type]);
    const units = [['unidades', 'Unidades'], ['kg', 'Kilos (kg)'], ['litros', 'Litros'], ['porciones', 'Porciones / platos'], ['cajas', 'Cajas'], ['bolsas', 'Bolsas']];
    const storage = [['Temperatura ambiente', 'Fuera de la refrigeradora'], ['Refrigerado', 'En la refrigeradora'], ['Congelado', 'Congelado'], ['Mantener caliente', 'Debe mantenerse caliente'], ['Otra condición declarada', 'Otro (explícalo abajo)']];
    setContent(`${heading(editing ? 'Actualiza tu donación' : 'Publica una donación', 'Completa estos 4 pasos. Toma menos de 5 minutos.')}<form id="donation-form" class="mvp-form-layout" data-id="${d?.id_donacion || ''}"><div class="mvp-form-main"><section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>01</span><div><h2>¿Qué vas a donar?</h2><p>Cuéntanos qué alimento es y cuánto hay.</p></div></div><div class="form-grid">${field('¿Qué alimento es?', 'alimento', 'text', d?.alimento || '', 'required maxlength="160" placeholder="Ej. Pan francés del día"')}<label>Tipo de alimento<select class="form-control" name="categoria" required><option value="">Elige una opción</option>${choices(categories, FOOD_TYPES.includes(d?.categoria) ? d.categoria : '')}</select></label>${field('¿Cuánto hay?', 'cantidad', 'text', d?.cantidad || '', 'inputmode="decimal" maxlength="9" required placeholder="Ej. 30"', 'Solo números. Hasta 100 000.')}<label>Medida<select class="form-control" name="unidad" required>${choices(units, d?.unidad)}</select></label><label class="full">Detalles (opcional)<textarea class="form-control" name="descripcion" maxlength="2500" placeholder="Ej. Pan de esta mañana, en bolsas de 10 unidades">${escape(d?.descripcion || '')}</textarea><small class="field-hint">Todo lo que ayude a la beneficiaria a saber qué va a recibir.</small></label></div></section><section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>03</span><div><h2>¿Cómo se guarda y cuándo se recoge?</h2><p>Así la beneficiaria sabe cómo transportarlo y a qué hora ir.</p></div></div><div class="form-grid"><label>¿Cómo debe guardarse?<select class="form-control" name="conservacion_declarada" required>${choices(storage, d?.conservacion_declarada)}</select></label>${field('¿En qué está empacado?', 'envase', 'text', d?.envase || '', 'required minlength="2" maxlength="100" placeholder="Ej. Bolsas cerradas, cajas, táperes"')}${field('Temperatura (opcional)', 'temperatura_declarada', 'text', d?.temperatura_declarada || '', 'maxlength="50" placeholder="Ej. Entre 2 y 6 °C"', 'Solo si la conoces, por ejemplo la que indica la etiqueta.')}<label class="check-row full cold-check"><input type="checkbox" name="requiere_cadena_frio" ${d?.requiere_cadena_frio ? 'checked' : ''}><span><strong>Debe mantenerse frío durante el viaje</strong>Quien lo recoja tendrá que llevar un cooler o algo para mantenerlo frío.</span></label>${field('¿Desde cuándo se puede recoger?', 'fecha_disponibilidad', 'datetime-local', localInputDate(d?.fecha_disponibilidad), 'required')}${field('¿Hasta cuándo se puede recoger?', 'fecha_limite_recojo', 'datetime-local', localInputDate(d?.fecha_limite_recojo, 6), 'required', 'Después de esta hora ya no se podrá pedir.')}${field('¿Hasta cuándo se puede consumir? (opcional)', 'fecha_limite_aprovechamiento_declarada', 'datetime-local', d?.fecha_limite_aprovechamiento_declarada ? localInputDate(d.fecha_limite_aprovechamiento_declarada) : '', '', 'Por ejemplo, la fecha de vencimiento del producto.')}<label class="full">Indicaciones para el recojo (opcional)<textarea class="form-control" name="observaciones" maxlength="2500" placeholder="Ej. Tocar el timbre de la puerta lateral. No apilar las cajas.">${escape(d?.observaciones || '')}</textarea></label></div><div class="responsibility-note"><i class="fa-solid fa-circle-info"></i><p>Tú conoces mejor tu alimento: asegúrate de que la información sea correcta. La plataforma no revisa la calidad del alimento.</p></div></section><section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>04</span><div><h2>¿Dónde se recoge?</h2><p>Marca en el mapa el lugar exacto.</p></div></div>${geographicFields(p, true)}</section><div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="form-actions">${action('Cancelar', 'navigate', 'data-target="mis-donaciones"')}<button class="btn btn-primary" type="submit"><i class="fa-solid fa-${editing ? 'check' : 'paper-plane'}"></i> ${editing ? 'Guardar cambios' : 'Publicar donación'}</button></div></div><aside class="mvp-form-aside"><div class="form-guide"><span class="guide-icon"><i class="fa-solid fa-hand-holding-heart"></i></span><span class="section-kicker">ANTES DE PUBLICAR</span><h2>Revisa que tengas:</h2><ul><li><i class="fa-solid fa-check"></i> Qué alimento es y cuánto hay</li><li><i class="fa-solid fa-check"></i> 3 fotos: de frente, de costado y de cerca</li><li><i class="fa-solid fa-check"></i> El horario en que se puede recoger</li><li><i class="fa-solid fa-check"></i> El lugar marcado en el mapa</li></ul><p class="guide-footnote">Si tienes dudas sobre si un alimento se puede donar, consulta antes con un especialista.</p></div></aside></form>`, editing ? 'Editar donación' : 'Publicar donación');
    mountLocation($('#donation-form'), p, true);
  }
  async function searchAddress(button) {
    const form = button.closest('form');
    const address = form.elements.namedItem('direccion_recojo') || form.elements.namedItem('direccion');
    if (!address.value.trim()) throw new Error('Escribe una dirección para buscarla.');
    const found = await REAMaps.search([address.value, form.distrito.value, 'Puno, Perú'].join(', '));
    const results = $('[data-geocode-results]'); results.replaceChildren();
    if (!found.length) { results.textContent = 'No encontramos esa dirección. Selecciona y confirma el punto directamente en el mapa.'; return; }
    found.slice(0, 5).forEach(point => { const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'geocode-result'; choice.textContent = point.display_name; choice.addEventListener('click', () => { picker.setPosition(point.latitud, point.longitud); results.replaceChildren(); }); results.append(choice); });
  }
  function renderRequests() {
    const donor = role === 'donante';
    setContent(`${heading(donor ? 'Conecta tu donación con la mejor coordinación.' : role === 'administrador' ? 'Solicitudes de la red' : 'Tus oportunidades, en un solo lugar.', donor ? 'Compara las beneficiarias y sus rutas antes de decidir. Solo una solicitud puede ser aceptada por donación.' : 'Consulta decisiones y condiciones de recojo. Las solicitudes son registros persistentes.', action('<i class="fa-solid fa-rotate"></i> Actualizar', 'refresh') + action('<i class="fa-solid fa-clock-rotate-left"></i> Historial de decisiones', 'navigate', 'data-target="auditoria"'))}<div class="mvp-request-tabs" role="group" aria-label="Filtrar solicitudes">${['todas', 'pendiente', 'aceptada', 'rechazada', 'cancelada'].map((s, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-request-filter="${s}">${s === 'todas' ? 'Todas' : label(s)} <span>${s === 'todas' ? state.requests.length : state.requests.filter(r => normalized(r.estado) === s).length}</span></button>`).join('')}</div><div class="mvp-requests-list" data-request-list></div>`, 'Solicitudes');
    renderRequestList();
  }
  function renderRequestList(filter = 'todas') {
    const requests = state.requests.filter(r => filter === 'todas' || normalized(r.estado) === filter);
    $('[data-request-list]').innerHTML = requests.map(r => {
      const donor = role === 'donante';
      const pending = normalized(r.estado) === 'pendiente';
      const other = donor || role === 'administrador' ? { name: r.organizacion?.nombre || 'Beneficiaria', photo: r.organizacion?.foto_url, note: r.organizacion?.tipo_organizacion } : { name: r.donante?.nombre_establecimiento || 'Establecimiento donante', photo: r.donante?.foto_url, note: r.donante?.distrito };
      const own = role === 'organizacion';
      const ownActions = !own ? '' : `${pending ? action('<i class="fa-regular fa-pen-to-square"></i> Editar', 'modify-request', `data-id="${r.id_solicitud}"`) + action('Cancelar solicitud', 'cancel-request', `data-id="${r.id_solicitud}"`, 'btn-danger-outline') : ''}${normalized(r.estado) !== 'aceptada' ? action('<i class="fa-regular fa-trash-can"></i> Eliminar', 'delete-request', `data-id="${r.id_solicitud}"`, 'btn-danger-outline') : ''}`;
      return `<article class="mvp-request-card"><div class="request-card-header">${profilePhoto(other.photo, other.name, 'md')}<div><span class="section-kicker">SOLICITUD #${r.id_solicitud} · DONACIÓN #${r.id_donacion || r.donacion?.id_donacion}</span><h2>${escape(other.name)}</h2>${other.note ? `<small class="request-entity-note">${escape(other.note)}</small>` : ''}</div>${badge(r.estado)}</div><div class="request-card-content"><div><h3>${escape(r.donacion?.alimento || 'Alimento publicado')}</h3><p>${escape(r.observaciones || 'Sin observaciones adicionales.')}</p><dl class="request-facts">${pair('Responsable del recojo', r.responsable_recojo)}${pair('Fecha propuesta', date(r.fecha_propuesta))}${pair('Transporte declarado', r.transporte_declarado)}${pair('Recipiente declarado', r.recipiente_declarado)}${pair('Tiempo para llegar', arrivalText(r.tiempo_llegada_min))}</dl></div><div class="request-card-actions">${action('<i class="fa-solid fa-route"></i> Ver ruta de entrega', 'request-detail', `data-id="${r.id_solicitud}"`)}${action('<i class="fa-solid fa-file-pdf"></i> Comprobante (PDF)', 'request-receipt', `data-id="${r.id_solicitud}"`)}${donor && pending ? action('<i class="fa-solid fa-check"></i> Aceptar solicitud', 'accept-request', `data-id="${r.id_solicitud}"`, 'btn-primary') + action('Rechazar', 'reject-request', `data-id="${r.id_solicitud}"`, 'btn-danger-outline') : ownActions}</div></div>${r.motivo_decision || r.motivo ? `<p class="decision-note"><i class="fa-solid fa-comment"></i> ${escape(r.motivo_decision || r.motivo)}</p>` : ''}<div class="request-card-footer"><span>Registrada ${date(r.fecha_creacion)}</span><span><i class="fa-solid fa-shield-halved"></i> Decisiones con auditoría</span></div></article>`;
    }).join('') || empty('Aún no hay solicitudes aquí', role === 'donante' ? 'Las beneficiarias interesadas en tus publicaciones aparecerán en esta vista.' : 'Encuentra una donación y envía una solicitud para comenzar.');
    REAPresentation.decorate(main,state);
  }
  // prefill: valores ya escritos cuando la beneficiaria vuelve del resumen para corregir.
  function newRequestModal(prefill = null) {
    const d = state.selected;
    const v = prefill || { responsable_recojo: state.user.nombre, telefono: state.user.telefono || '' };
    openDialog(`${state.editingRequest ? 'Editar solicitud' : 'Pedir'}: ${d.alimento}`, `<form id="request-form"><p class="dialog-intro">${state.editingRequest ? 'Estás corrigiendo tu solicitud. ' : ''}Vas a pedir <strong>${number(d.cantidad)} ${escape(d.unidad)}</strong>. El donante revisará tu pedido y te avisará si lo acepta. Hasta entonces, la donación no queda reservada.</p><div class="form-grid"><label>¿Quién irá a recoger?<input class="form-control" name="responsable_recojo" value="${escape(v.responsable_recojo)}" required maxlength="150" placeholder="Nombre y apellido"></label><label>Teléfono de contacto<input class="form-control" name="telefono" type="tel" inputmode="numeric" value="${escape(v.telefono)}" required maxlength="9" placeholder="Ej. 951234567"></label><label class="full">¿Cuándo pueden ir a recogerlo?<input class="form-control" name="fecha_propuesta" type="datetime-local" value="${v.fecha_propuesta ? localInputDate(v.fecha_propuesta) : localInputDate(null, 1)}" required></label><label class="full">¿En qué lo van a transportar?<input class="form-control" name="transporte_declarado" value="${escape(v.transporte_declarado || '')}" required placeholder="Ej. Mototaxi, auto, camioneta, a pie" maxlength="100"></label><label class="full">¿Cuánto tardarán en llegar al lugar de recojo? (minutos)<input class="form-control" name="tiempo_llegada_min" inputmode="numeric" value="${escape(v.tiempo_llegada_min || '')}" required maxlength="3" placeholder="Ej. 40"><small class="field-hint">Cuenta el tiempo real según cómo van a ir (combi, mototaxi, a pie), incluidas las esperas. El donante lo verá.</small></label><label class="full">¿En qué lo van a llevar?<input class="form-control" name="recipiente_declarado" value="${escape(v.recipiente_declarado || '')}" required placeholder="Ej. Cajas, bolsas, táperes con tapa" maxlength="100"></label><label class="full">Mensaje para el donante (opcional)<textarea class="form-control" name="observaciones" maxlength="2500" placeholder="Ej. Llegaremos en una mototaxi azul. Cualquier cambio, llamar a este número.">${escape(v.observaciones || '')}</textarea></label></div><label class="check-row"><input type="checkbox" name="dispone_cadena_frio" ${v.dispone_cadena_frio ? 'checked' : ''}><span>Podemos mantenerlo frío durante el viaje (cooler, hielo, etc.)</span></label>${d.requiere_cadena_frio ? '<div class="mvp-message warning">Este alimento debe mantenerse frío. Lleva un cooler o algo para conservarlo.</div>' : ''}<div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="dialog-actions">${action('Volver', 'close-dialog')}<button class="btn btn-primary" type="submit"><i class="fa-solid fa-eye"></i> Revisar solicitud</button></div></form>`);
  }
  async function sendRequest() {
    const editing = state.editingRequest;
    const result = editing
      ? await REA.request(`/api/solicitudes/${editing}`, { method: 'PATCH', body: state.pendingRequest })
      : await REA.request(`/api/donaciones/${state.selected.id_donacion}/solicitudes`, { method: 'POST', body: state.pendingRequest });
    state.pendingRequest = null; state.editingRequest = null;
    closeDialog(); await loadData();
    // El comprobante usa la solicitud como quedó guardada (número, fecha de registro, donación y beneficiaria).
    let receiptError = null;
    try { await REAReceipt.downloadRequest(state.requests.find(r => r.id_solicitud === result.data.id_solicitud) || result.data, state.user, state.profile); } catch (error) { receiptError = error; }
    await navigate('solicitudes');
    toast(receiptError ? `Solicitud ${editing ? 'actualizada' : 'enviada'}, pero no se pudo descargar el comprobante. Descárgalo desde Solicitudes.` : `Solicitud ${editing ? 'actualizada' : 'enviada'}. Se descargó tu comprobante en PDF.`);
  }
  function decisionDialog(type, id) {
    const titles = { 'cancel-donation': 'Cancelar donación', 'accept-request': 'Aceptar solicitud', 'reject-request': 'Rechazar solicitud', 'cancel-request': 'Cancelar solicitud', 'delete-donation': 'Eliminar donación', 'delete-request': 'Eliminar solicitud' };
    const removing = type.startsWith('delete-');
    const donationId = type.endsWith('-donation') ? '' : state.requests.find(r => String(r.id_solicitud) === String(id))?.id_donacion || '';
    const intro = type === 'accept-request' ? 'Esta beneficiaria recogerá tu donación. Los demás pedidos para esta donación se rechazarán automáticamente.'
      : type === 'delete-donation' ? 'La publicación y sus fotos se borrarán por completo. Esta acción no se puede deshacer.'
      : type === 'delete-request' ? 'Tu solicitud se borrará de tu lista y el donante ya no la verá. Esta acción no se puede deshacer.'
      : 'La otra persona verá el motivo que escribas.';
    openDialog(titles[type], `<form id="decision-form" data-type="${type}" data-id="${id}" data-donation="${escape(donationId)}"><p class="dialog-intro">${intro}</p>${type === 'accept-request' || removing ? '' : '<label>¿Por qué?<textarea class="form-control" name="motivo" required minlength="5" maxlength="1000" placeholder="Ej. Ya no tenemos el alimento disponible"></textarea></label>'}<div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="dialog-actions">${action('Volver', 'close-dialog')}<button type="submit" class="btn ${type === 'accept-request' ? 'btn-primary' : 'btn-danger'}">${titles[type]}</button></div></form>`);
  }
  async function renderProfile() {
    const result = await REA.request('/api/perfil');
    const user = result.data.usuario;
    const p = result.data.perfil || {};
    state.profile = p;
    const donor = role === 'donante', admin = role === 'administrador';
    const entity = admin ? user.nombre : p.nombre_establecimiento || p.nombre || '';
    if (!state.profileEditing) {
      const rows = list => `<dl class="profile-data-list">${list.map(([name, value]) => pair(name, value || 'Sin completar')).join('')}</dl>`;
      const panel = (icon, title, list) => `<section class="mvp-panel profile-data-panel"><h2><i class="fa-solid ${icon}"></i> ${title}</h2>${rows(list)}</section>`;
      const entityRows = donor ? [['Nombre del negocio', entity], ['RUC', p.ruc]] : [['Tipo de organización', p.tipo_organizacion], ['Nombre de la entidad', entity], ['Personas beneficiadas', Number(p.numero_beneficiarios) ? `${number(p.numero_beneficiarios)} personas` : '']];
      const contactRows = [['Representante', user.nombre], ...(admin ? [] : [['DNI del representante', p.dni_representante]]), ['Celular o teléfono', user.telefono], ['Correo electrónico', user.correo]];
      const placeRows = [['Dirección', p.direccion], ['Referencia', p.referencia], ['Distrito', p.distrito], ['Provincia', p.provincia], ['Departamento', p.departamento || 'Puno']];
      setContent(`${heading('Mi perfil', admin ? 'Tus datos de acceso a la plataforma.' : 'Así te ven las demás personas de la red cuando coordinan contigo.', action('<i class="fa-regular fa-pen-to-square"></i> Modificar mis datos', 'edit-profile', '', 'btn-primary'))}
        <section class="mvp-panel profile-hero">${profilePhoto(admin ? null : p.foto_url, entity, 'xl')}<div><span class="section-kicker">${admin ? 'ADMINISTRACIÓN' : donor ? 'DONANTE' : 'ENTIDAD BENEFICIARIA'}</span><h2>${escape(entity)}</h2><p>${escape([admin ? '' : donor ? 'Negocio donante' : p.tipo_organizacion, p.distrito].filter(Boolean).join(' · ') || user.correo)}</p>${admin ? '' : badge(p.estado_verificacion || 'pendiente')}${!admin && !p.foto_url ? '<p class="small-muted profile-photo-hint"><i class="fa-solid fa-camera"></i> Sube la foto de tu fachada o tu logo para que te reconozcan al llegar.</p>' : ''}</div></section>
        <div class="profile-data-grid">${admin ? '' : panel(donor ? 'fa-store' : 'fa-people-roof', donor ? 'Datos del negocio' : 'Datos de la entidad', entityRows)}${panel('fa-id-card', 'Representante y contacto', contactRows)}${admin ? '' : `<section class="mvp-panel profile-data-panel profile-place-panel"><h2><i class="fa-solid fa-location-dot"></i> Ubicación del local</h2>${rows(placeRows)}<div class="map-surface profile-map" id="profile-map"></div></section>`}</div>`, 'Mi perfil');
      if (!admin && window.REAMaps && p.latitud != null) picker = REAMaps.mountPicker($('#profile-map'), { latitud: p.latitud, longitud: p.longitud, readonly: true });
      return;
    }
    const field = (labelText, name, value, extra = '', hint = '', cls = '') => `<label class="${cls}">${labelText}<input class="form-control" name="${name}" value="${escape(value ?? '')}" ${extra}>${hint ? `<small class="field-hint">${hint}</small>` : ''}</label>`;
    const types = window.REAPuno?.TIPOS_ORGANIZACION || [];
    const entityFields = admin ? '' : donor
      ? `${field('Nombre de tu negocio', 'entidad', entity, 'required maxlength="200" placeholder="Ej. Panadería San Juan"', '', 'full')}${field('RUC', 'ruc', p.ruc, 'required inputmode="numeric" minlength="11" maxlength="11" placeholder="Ej. 20123456789"', '11 números.', 'full')}`
      : `<label class="full">Tipo de organización<select class="form-control" name="tipo_organizacion" required><option value="">Elige el tipo</option>${types.map(t => `<option ${p.tipo_organizacion === t ? 'selected' : ''}>${escape(t)}</option>`).join('')}</select></label>${field('Nombre de tu entidad beneficiaria', 'entidad', entity, 'required maxlength="200" placeholder="Ej. Olla Común Virgen de la Candelaria"', '', 'full')}${field('Número de personas beneficiadas', 'numero_beneficiarios', Number(p.numero_beneficiarios) || '', 'required inputmode="numeric" maxlength="6" placeholder="Ej: 60 personas"', '', 'full')}`;
    const section = (n, title, text, body) => `<section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>${n}</span><div><h2>${title}</h2><p>${text}</p></div></div>${body}</section>`;
    let n = 0; const step = () => String(++n).padStart(2, '0');
    setContent(`${heading('Modificar mis datos', 'Cambia lo que necesites y pulsa Guardar cambios.')}<form id="profile-form" class="mvp-form-layout"><div class="mvp-form-main">
      ${admin ? '' : section(step(), 'Tu foto de perfil', 'La foto de tu fachada o tu logo ayuda a que te reconozcan al llegar.', `<div class="profile-photo-edit">${profilePhoto(p.foto_url, entity, 'lg')}<img class="local-photo-preview" data-local-preview alt="Vista previa de la nueva foto" hidden><label class="photo-file-field">Cambiar foto (opcional)<input class="form-control" name="foto_local" type="file" accept="image/jpeg,image/png,image/webp"><small class="field-hint">JPG, PNG o WebP de hasta 5 MB.</small></label></div>`)}
      ${admin ? '' : section(step(), donor ? 'Datos del negocio' : 'Datos de la entidad', donor ? 'Nombre y RUC de tu negocio.' : 'Qué tipo de organización es y a cuántas personas atiende.', `<div class="form-grid">${entityFields}</div>`)}
      ${section(step(), 'Representante y contacto', 'Con estos datos coordinan contigo.', `<div class="form-grid">${field('Nombre completo del representante', 'nombre', user.nombre, 'required maxlength="150" autocomplete="name" placeholder="Nombres y apellidos"', '', 'full')}${admin ? '' : field('DNI del representante', 'dni_representante', p.dni_representante, 'required inputmode="numeric" minlength="8" maxlength="8" placeholder="Ej. 71234567"', '8 números.')}${field('Celular o teléfono de contacto', 'telefono', user.telefono, 'required type="tel" inputmode="numeric" minlength="9" maxlength="9" placeholder="Ej. 951234567"', '9 números.')}${state.user.es_demostracion ? field('Correo electrónico', 'correo', user.correo, 'readonly', 'Es una cuenta de prueba: su correo no se puede cambiar.', 'full') : field('Correo electrónico', 'correo', user.correo, 'required type="email" maxlength="150" autocapitalize="none" spellcheck="false" placeholder="usuario@dominio.com"', 'Sin ñ, tildes ni espacios. Lo usas para entrar.', 'full')}</div>`)}
      ${admin ? '' : section(step(), '¿Dónde está tu local?', 'Marca en el mapa dónde está tu local.', geographicFields(p))}
      ${section(step(), 'Cambiar contraseña (opcional)', 'Déjalo vacío si no quieres cambiarla.', `<div class="form-grid">${field('Contraseña actual', 'contrasena_actual', '', 'type="password" maxlength="128" autocomplete="current-password"', '', 'full')}${field('Nueva contraseña', 'contrasena', '', 'type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Mínimo 8 caracteres"', 'Al menos 8 caracteres, con letras y números.')}${field('Confirmar nueva contraseña', 'confirmacion', '', 'type="password" minlength="8" maxlength="128" autocomplete="new-password"')}</div>`)}
      <div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="form-actions">${action('Cancelar', 'cancel-profile-edit')}<button class="btn btn-primary" type="submit"><i class="fa-solid fa-check"></i> Guardar cambios</button></div></div><aside class="mvp-form-aside"><div class="form-guide"><span class="guide-icon"><i class="fa-solid fa-user-pen"></i></span><h2>Mantén tus datos al día</h2><p>Tu foto, tu dirección y tu celular ayudan a que la otra parte te encuentre y coordine contigo.</p><p class="guide-footnote">Tu DNI no se muestra a las demás personas de la red.</p></div></aside></form>`, 'Modificar mis datos');
    if (!admin) {
      mountLocation($('#profile-form'), p);
      const photoInput = $('#profile-form').foto_local, preview = $('[data-local-preview]');
      photoInput.addEventListener('change', () => {
        const file = photoInput.files[0];
        const problem = !file ? '' : !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? 'Elige una foto JPG, PNG o WebP.' : file.size > 5 * 1024 * 1024 ? 'La foto debe pesar como máximo 5 MB.' : '';
        photoInput.setCustomValidity(problem);
        if (preview.src) URL.revokeObjectURL(preview.src);
        preview.hidden = !file || Boolean(problem);
        if (file && !problem) preview.src = URL.createObjectURL(file); else preview.removeAttribute('src');
        if (problem) photoInput.reportValidity();
      });
    }
  }
  async function renderAudit() {
    const result = await REA.request('/api/auditoria');
    const rows = result.data || [];
    setContent(`${heading('Cada decisión deja una huella.', 'Historial persistente de publicaciones, solicitudes y cambios registrados por el servidor.')}<div class="mvp-panel table-wrap"><table class="data-table"><thead><tr><th>Fecha y hora</th><th>Entidad</th><th>Referencia</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${rows.map(row => `<tr><td>${date(row.fecha_evento)}</td><td>${escape(row.entidad)}</td><td>#${escape(row.id_entidad)}</td><td>${escape(row.accion)}</td><td class="audit-detail">${escape(typeof row.detalle === 'string' ? row.detalle : JSON.stringify(row.detalle || {}))}</td></tr>`).join('') || '<tr><td colspan="5">Todavía no hay eventos registrados.</td></tr>'}</tbody></table></div>`, 'Historial de cambios');
  }
  function renderPending(view) {
    const modules = { seguimiento: ['Seguimiento y cadena de custodia', 'Se conserva el diseño conceptual de preparación, recojo, traslado, entrega y confirmación. Los hitos operativos y las transferencias de custodia aún no se registran en esta versión.', 'fa-route'], notificaciones: ['Centro de notificaciones', 'Los avisos automáticos y las preferencias de comunicación están pendientes. Consulta el estado real de tus operaciones en Donaciones y Solicitudes.', 'fa-bell'], incidencias: ['Incidencias', 'El registro, asignación y resolución de incidencias se desarrollará en el siguiente incremento.', 'fa-triangle-exclamation'], verificaciones: ['Verificación administrativa', 'La revisión documental y aprobación de nuevas cuentas aún no están habilitadas. Las cuentas de prueba se verifican mediante datos de semilla identificados.', 'fa-user-check'], reportes: ['Reportes e impacto', 'Los informes exportables y las métricas de impacto están pendientes. La vista general muestra únicamente conteos de registros existentes.', 'fa-chart-column'], usuarios: ['Gestión de usuarios', 'La administración de cuentas, bloqueos y permisos avanzados está prevista para el siguiente incremento.', 'fa-users'], donantes: ['Directorio de donantes', 'La edición administrativa del directorio está pendiente. Los donantes acceden a la gestión real de su perfil y de sus publicaciones.', 'fa-store'], organizaciones: ['Directorio de beneficiarias', 'La administración del directorio está pendiente. Cada beneficiaria puede actualizar su ubicación y consultar sus solicitudes reales.', 'fa-people-roof'], configuracion: ['Configuración', 'Las preferencias administrativas avanzadas se configurarán en una próxima versión. Los proveedores y umbrales actuales se definen en el entorno del servidor.', 'fa-gear'] };
    const [title, text, icon] = modules[view] || [view, 'Este módulo forma parte del alcance futuro de REAlimenta.', 'fa-seedling'];
    setContent(`${heading(title, 'El proyecto crece por incrementos verificables.')}<section class="mvp-pending-panel"><span class="pending-label"><i class="fa-regular fa-clock"></i> Pendiente de implementación</span><span class="pending-illustration"><i class="fa-solid ${icon}"></i></span><h2>El siguiente paso también cuenta.</h2><p>${text}</p><div class="pending-scope"><span><i class="fa-solid fa-box-open"></i> Gestión de donaciones</span><span><i class="fa-solid fa-inbox"></i> Gestión de solicitudes</span><span><i class="fa-solid fa-route"></i> Evaluación de rutas</span></div>${action('Volver a la vista general <i class="fa-solid fa-arrow-right"></i>', 'navigate', 'data-target="dashboard"', 'btn-primary')}</section>`, title);
  }
  document.addEventListener('click', async event => {
    const nav = event.target.closest('[data-view]');
    const button = event.target.closest('[data-action]');
    const logout = event.target.closest('[data-logout]');
    const filter = event.target.closest('[data-request-filter]');
    if (filter) { $$('[data-request-filter]').forEach(b => b.classList.toggle('active', b === filter)); renderRequestList(filter.dataset.requestFilter); return; }
    if (!nav && !button && !logout) return;
    const trigger = nav || button || logout;
    trigger.disabled = true;
    try {
      if (logout) { await REA.request('/api/auth/logout', { method: 'POST' }); location.assign('login.html'); return; }
      if (nav) { await navigate(nav.dataset.view); return; }
      const id = button.dataset.id;
      switch (button.dataset.action) {
        case 'navigate': await navigate(button.dataset.target); break;
        case 'refresh': if (!state.user) { location.reload(); break; } await loadData(); await navigate(state.current); toast('Datos actualizados desde el servidor.'); break;
        case 'detail': await navigate('detalle', { id }); break;
        case 'route': await navigate('detalle', { id }); $('#route-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
        case 'download-receipt': await REAReceipt.download(state.selected, state.user, state.profile); break;
        case 'scroll-route': $('#route-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
        case 'edit': { if (id && String(state.selected?.id_donacion) !== String(id)) state.selected = (await REA.request(`/api/donaciones/${id}`)).data; state.current = 'nueva-donacion'; renderDonationForm(state.selected); break; }
        case 'cancel-donation': case 'accept-request': case 'reject-request': case 'cancel-request': case 'delete-donation': case 'delete-request': decisionDialog(button.dataset.action, id); break;
        case 'new-request': state.editingRequest = null; newRequestModal(); break;
        case 'modify-request': {
          const r = state.requests.find(item => String(item.id_solicitud) === String(id));
          state.selected = { ...r.donacion, donante: r.donante };
          state.editingRequest = r.id_solicitud;
          newRequestModal({ responsable_recojo: r.responsable_recojo, telefono: r.telefono, fecha_propuesta: r.fecha_propuesta, transporte_declarado: r.transporte_declarado, recipiente_declarado: r.recipiente_declarado, observaciones: r.observaciones, dispone_cadena_frio: r.dispone_cadena_frio, tiempo_llegada_min: r.tiempo_llegada_min });
          break;
        }
        case 'edit-profile': state.profileEditing = true; await renderProfile(); break;
        case 'cancel-profile-edit': state.profileEditing = false; await renderProfile(); break;
        case 'request-detail': { const request = state.requests.find(r => String(r.id_solicitud) === String(id)); await navigate('detalle', { id: request.id_donacion || request.donacion.id_donacion, request }); break; }
        case 'select-route-request': { const request = state.requests.find(r => String(r.id_solicitud) === String(id)); await navigate('detalle', { id: state.selected.id_donacion, request }); $('.place-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
        case 'close-dialog': closeDialog(); break;
        case 'edit-request': newRequestModal(state.pendingRequest); break;
        case 'confirm-request': await sendRequest(); break;
        case 'request-receipt': await REAReceipt.downloadRequest(state.requests.find(r => String(r.id_solicitud) === String(id)), role === 'organizacion' ? state.user : {}, role === 'organizacion' ? state.profile : {}); break;
        case 'confirm-publish': { closeDialog(); const donationForm = $('#donation-form'); if (donationForm) { donationForm.dataset.confirmed = 'true'; donationForm.requestSubmit(); } break; }
        case 'search-address': await searchAddress(button); break;
      }
    } catch (error) { if (error.status === 401) location.assign('login.html'); else showError(error); }
    finally { trigger.disabled = false; }
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('input[data-filter]')) return;
    state.filters[event.target.dataset.filter] = event.target.value;
    updateDonationResults();
  });
  document.addEventListener('change', event => {
    // Los inputs ya filtran con input; su blur no debe reemplazar el botón que recibe el clic.
    if (!event.target.matches('select[data-filter]')) return;
    state.filters[event.target.dataset.filter] = event.target.value;
    updateDonationResults();
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!['donation-form', 'request-form', 'decision-form', 'profile-form'].includes(form.id)) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    const original = submit.innerHTML;
    submit.disabled = true; submit.innerHTML = '<span class="loading-spinner small"></span> Procesando…';
    const errors = form.querySelector('[data-form-error], [data-route-error]');
    if (errors) errors.hidden = true;
    try {
      if (form.id === 'donation-form') {
        const missingPhotos = REAImages.missing(form);
        if (missingPhotos.length) throw new Error(`Faltan fotos: ${missingPhotos.join(', ')}. Necesitamos 3 fotos del alimento desde distintos ángulos.`);
        const values = Object.fromEntries(new FormData(form));
        delete values.foto;
        if (!values.latitud_recojo || !values.longitud_recojo) throw new Error('Marca en el mapa el lugar donde se recoge el alimento.');
        const body = { ...values, cantidad: Number(String(values.cantidad).replace(',', '.')), latitud_recojo: Number(values.latitud_recojo), longitud_recojo: Number(values.longitud_recojo), requiere_cadena_frio: form.requiere_cadena_frio.checked, ubicacion_confirmada: form.ubicacion_confirmada.checked };
        for (const field of ['fecha_disponibilidad', 'fecha_limite_recojo', 'fecha_limite_aprovechamiento_declarada']) body[field] = values[field] ? new Date(`${values[field]}:00-05:00`).toISOString() : null;
        if (new Date(body.fecha_disponibilidad) >= new Date(body.fecha_limite_recojo)) throw new Error('La hora final de recojo debe ser después de la hora de inicio.');
        if (body.fecha_limite_aprovechamiento_declarada && new Date(body.fecha_limite_aprovechamiento_declarada) < new Date(body.fecha_limite_recojo)) throw new Error('La fecha para consumir no puede ser antes de la hora final de recojo.');
        // Antes de guardar se muestra el resumen; "Confirmar y publicar" vuelve a enviar el formulario.
        if (form.dataset.confirmed !== 'true') { openDialog('Revisa tu donación antes de publicar', REAReceipt.preview(body, REAImages.previewUrls(form), state.user, state.profile)); return; }
        delete form.dataset.confirmed;
        const id = form.dataset.id;
        const result = await REA.request(`/api/donaciones${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body });
        form.dataset.id=result.data.id_donacion;
        try{await REAImages.upload(result.data.id_donacion,form);}catch(photoError){throw new Error(`Tu donación se guardó, pero una foto no se pudo subir: ${photoError.message} Vuelve a pulsar el botón para intentarlo otra vez (no se creará otra donación).`);}
        // El comprobante se arma con lo que quedó guardado en el servidor (número, fecha de registro y fotos).
        let receiptError = null;
        try { const saved = await REA.request(`/api/donaciones/${result.data.id_donacion}`); await REAReceipt.download(saved.data, state.user, state.profile, REAImages.previewUrls(form)); } catch (error) { receiptError = error; }
        await loadData();
        toast(receiptError ? 'Tu donación se publicó, pero no se pudo descargar el comprobante. Descárgalo desde el detalle.' : `${id ? 'Cambios guardados' : 'Tu donación ya está publicada'}. Se descargó tu comprobante en PDF.`);
        await navigate('detalle', { id: result.data.id_donacion });
      } else if (form.id === 'request-form') {
        const values = Object.fromEntries(new FormData(form));
        values.fecha_propuesta = new Date(`${values.fecha_propuesta}:00-05:00`).toISOString();
        values.dispone_cadena_frio = form.dispone_cadena_frio.checked;
        values.tiempo_llegada_min = Number(values.tiempo_llegada_min);
        if (new Date(values.fecha_propuesta) < new Date()) throw new Error('La hora para recoger ya pasó. Elige una hora futura.');
        if (new Date(values.fecha_propuesta) > new Date(state.selected.fecha_limite_recojo)) throw new Error('Esa hora es después del límite de recojo de la donación.');
        // Antes de guardar se muestra el resumen; "Confirmar y enviar" registra la solicitud.
        state.pendingRequest = values;
        openDialog('Revisa tu solicitud antes de enviarla', REAReceipt.requestPreview(values, state.selected, state.profile));
      } else if (form.id === 'decision-form') {
        const id = form.dataset.id;
        const type = form.dataset.type;
        if (type.startsWith('delete-')) {
          await REA.request(type === 'delete-donation' ? `/api/donaciones/${id}` : `/api/solicitudes/${id}`, { method: 'DELETE' });
          closeDialog(); await loadData();
          await navigate(type === 'delete-donation' ? 'mis-donaciones' : 'solicitudes');
          toast(type === 'delete-donation' ? 'Donación eliminada.' : 'Solicitud eliminada.');
          return;
        }
        const route = { 'cancel-donation': `/api/donaciones/${id}/cancelar`, 'accept-request': `/api/solicitudes/${id}/aceptar`, 'reject-request': `/api/solicitudes/${id}/rechazar`, 'cancel-request': `/api/solicitudes/${id}/cancelar` }[type];
        const decision = await REA.request(route, { method: 'POST', body: { motivo: form.motivo?.value.trim() || '', ...(form.dataset.donation ? { id_donacion: Number(form.dataset.donation) } : {}) } });
        closeDialog(); await loadData();
        if(type==='accept-request'&&decision.data.id_seguimiento){REACustody.setTarget(decision.data.id_seguimiento);await navigate('seguimiento');toast('Solicitud aceptada. Ya puedes preparar el recojo y registrar la cadena de custodia.');}
        else{await navigate(type === 'cancel-donation' ? 'mis-donaciones' : 'solicitudes');toast('Decisión guardada correctamente.');}
      } else if (form.id === 'profile-form') {
        const values = Object.fromEntries(new FormData(form));
        const admin = role === 'administrador';
        if (!admin && (!values.latitud || !values.longitud)) throw new Error('Marca en el mapa dónde está tu local.');
        if (values.contrasena && !values.contrasena_actual) throw new Error('Escribe tu contraseña actual para poder cambiarla.');
        if (values.contrasena !== values.confirmacion) throw new Error('Las contraseñas nuevas no coinciden.');
        const perfil = admin ? {} : { departamento: values.departamento, provincia: values.provincia, distrito: values.distrito, direccion: values.direccion, referencia: values.referencia, latitud: Number(values.latitud), longitud: Number(values.longitud), ubicacion_confirmada: form.ubicacion_confirmada.checked, responsable: values.nombre, dni_representante: values.dni_representante };
        if (role === 'donante') Object.assign(perfil, { nombre_establecimiento: values.entidad, ruc: values.ruc });
        if (role === 'organizacion') Object.assign(perfil, { nombre: values.entidad, tipo_organizacion: values.tipo_organizacion, numero_beneficiarios: Number(values.numero_beneficiarios) });
        const file = form.foto_local?.files[0];
        const foto = file ? { tipo: file.type, datos: await readBase64(file) } : undefined;
        const result = await REA.request('/api/perfil', { method: 'PATCH', body: { nombre: values.nombre, telefono: values.telefono, correo: values.correo.trim().toLowerCase(), perfil, foto } });
        state.user = { ...state.user, ...result.data.usuario }; state.profile = result.data.perfil || {}; state.evaluations.clear(); identity();
        // La contraseña va aparte: el servidor renueva la sesión al cambiarla.
        if (values.contrasena) await REA.request('/api/auth/contrasena', { method: 'POST', body: { actual: values.contrasena_actual, nueva: values.contrasena } });
        state.profileEditing = false; await renderProfile();
        toast(values.contrasena ? 'Tus datos y tu contraseña se guardaron.' : 'Tus datos se guardaron.');
      }
    } catch (error) { showError(error, errors); }
    finally { submit.disabled = false; submit.innerHTML = original; }
  });
  REAPresentation.configure({displayRoute,renderEvaluation});
  REACustody.configure({main,role,heading,setContent,renderEvaluation,date,number,escape,openDialog,closeDialog,toast,user:()=>state.user,profile:()=>state.profile});
  try {
    state.user = await REA.me();
    if (state.user.rol !== role) { location.replace(REA.destination(state.user.rol)); return; }
    const profile = await REA.request('/api/perfil');
    state.user = { ...state.user, ...profile.data.usuario };
    state.profile = profile.data.perfil || {};
    identity(); await loadData();
    const initial = location.hash.slice(1) || 'dashboard';
    await navigate(initial === 'detalle' ? 'dashboard' : initial);
  } catch (error) {
    if (error.status === 401) { location.replace('login.html'); return; }
    setContent(`${heading('No pudimos cargar tu espacio', 'Comprueba la conexión con el servidor y vuelve a intentarlo.')}<div class="mvp-message error">${escape(error.message)}</div>${action('Reintentar', 'refresh', '', 'btn-primary')}`, 'Error de conexión');
  }
});
