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
  const role = document.body.dataset.role;
  const state = { user: null, profile: {}, donations: [], requests: [], stats: {}, current: 'dashboard', selected: null, selectedRequest: null, evaluations: new Map(), filters: { q: '', categoria: '', distrito: '', estado: '' } };
  const main = $('#main-content');
  const dialog = $('#app-dialog');
  let picker = null;
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
    $('[data-avatar]').textContent = state.user.nombre.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
    $('[data-account-status]').textContent = `${state.user.es_demostracion ? 'Cuenta de prueba · ' : ''}${role === 'administrador' ? 'Administración de la plataforma' : `${label(profile.estado_verificacion || 'pendiente')} · ${profile.distrito || 'Ubicación pendiente'}`}`;
  }
  function setContent(html, title) {
    window.REAMaps?.dispose(main);
    window.REAImages?.dispose(main);
    picker?.destroy?.(); picker = null;
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
    else if (view === 'perfil' || view === 'establecimiento' || view === 'organizacion') await renderProfile();
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
      ? metric('fa-users', state.stats.usuarios ?? '—', 'Usuarios registrados', 'Base de datos') + metric('fa-store', state.stats.donantes ?? '—', 'Donantes', 'En la red') + metric('fa-people-roof', state.stats.organizaciones ?? '—', 'Organizaciones', 'En la red') + metric('fa-box-open', state.donations.length, 'Donaciones', 'Registros reales')
      : donor ? metric('fa-box-open', state.donations.length, 'Donaciones registradas', 'Tu contribución') + metric('fa-seedling', available.length, 'Donaciones disponibles', 'Esperan una oportunidad') + metric('fa-inbox', pending.length, 'Solicitudes pendientes', 'Por revisar') + metric('fa-arrows-rotate', process.length, 'Donaciones en proceso', 'Ya tienen destinatario')
      : metric('fa-basket-shopping', available.length, 'Donaciones disponibles', 'Explora la red') + metric('fa-paper-plane', state.requests.length, 'Mis solicitudes', 'Historial completo') + metric('fa-circle-check', accepted.length, 'Solicitudes aceptadas', 'Listas para coordinar') + metric('fa-clock', pending.length, 'Pendientes de respuesta', 'En manos del donante');
    const alertDonations = available.filter(d => new Date(d.fecha_limite_recojo).getTime() - Date.now() < 4 * 3600000);
    const cards = available.slice(0, role === 'organizacion' ? 3 : 2).map(donationCard).join('');
    setContent(`${heading(title, 'Una vista clara de tus donaciones, solicitudes y nuevas oportunidades.', donor ? action('<i class="fa-solid fa-plus"></i> Publicar donación', 'navigate', 'data-target="nueva-donacion"', 'btn-primary') : action(role === 'administrador' ? 'Consultar donaciones' : '<i class="fa-solid fa-magnifying-glass"></i> Buscar donaciones', 'navigate', `data-target="${role === 'administrador' ? 'donaciones' : 'disponibles'}"`, 'btn-primary'))}
      <div class="mvp-metrics">${metrics}</div>
      <div class="mvp-feature-banner"><div><span class="small-kicker">DE LA DISPONIBILIDAD A LA OPORTUNIDAD</span><h2>Una buena conexión<br>empieza con una ruta clara.</h2><p>Consulta ubicaciones, calcula una ruta por carretera y evalúa el tiempo antes de coordinar.</p>${action('Explorar donaciones <i class="fa-solid fa-arrow-right"></i>', 'navigate', `data-target="${donor ? 'mis-donaciones' : role === 'administrador' ? 'donaciones' : 'disponibles'}"`, 'btn-light')}</div><div class="route-illustration" aria-hidden="true"><span class="illustration-pin origin"><i class="fa-solid fa-store"></i></span><span class="illustration-road"></span><span class="illustration-pin destination"><i class="fa-solid fa-people-roof"></i></span><span class="illustration-label">Una red. Más posibilidades.</span></div></div>
      <div class="mvp-dashboard-grid"><article class="mvp-panel"><div class="panel-heading"><div><span class="section-kicker">MOVIMIENTO EN TU RED</span><h2>${donor ? 'Solicitudes recientes' : 'Tus últimas solicitudes'}</h2></div>${action('Ver todas <i class="fa-solid fa-arrow-right"></i>', 'navigate', 'data-target="solicitudes"', 'btn-text')}</div>${state.requests.length ? `<div class="compact-requests">${state.requests.slice(0, 4).map(r => `<button class="compact-request" type="button" data-action="request-detail" data-id="${r.id_solicitud}"><span class="compact-icon"><i class="fa-solid fa-box-open"></i></span><span><strong>${escape(r.donacion?.alimento || 'Donación')}</strong><small>${escape(r.organizacion?.nombre || r.donante?.nombre_establecimiento || `Solicitud #${r.id_solicitud}`)}</small></span>${badge(r.estado)}<i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>` : empty('Las buenas conexiones están por llegar', donor ? 'Tus solicitudes aparecerán aquí cuando una organización se interese en tu donación.' : 'Busca una donación y envía tu primera solicitud.')}</article><aside class="mvp-panel"><div class="panel-heading"><div><span class="section-kicker">PARA TENER EN CUENTA</span><h2>Planifica con información</h2></div><span class="round-icon"><i class="fa-regular fa-lightbulb"></i></span></div><div class="insight-item"><span class="insight-icon amber"><i class="fa-regular fa-clock"></i></span><div><strong>${alertDonations.length ? `${alertDonations.length} donación(es) con recojo próximo` : 'Cada ventana de recojo importa'}</strong><p>${alertDonations.length ? 'Hay publicaciones con menos de cuatro horas hasta su límite de recojo.' : 'Revisa disponibilidad, conservación y horarios antes de enviar o aceptar una solicitud.'}</p></div></div><div class="insight-item"><span class="insight-icon"><i class="fa-solid fa-route"></i></span><div><strong>Calcula antes de coordinar</strong><p>La evaluación logística compara la duración real de ruta con el límite de aprovechamiento declarado.</p></div></div><div class="responsibility-note"><i class="fa-solid fa-circle-info"></i><p>La información alimentaria es declarada. REAlimenta no certifica inocuidad ni monitorea temperatura.</p></div></aside></div>
      ${role !== 'administrador' ? `<div class="section-row"><div><span class="section-kicker">ALIMENTOS CON UNA NUEVA OPORTUNIDAD</span><h2>${donor ? 'Tus publicaciones disponibles' : 'Descubre lo que puedes aprovechar'}</h2></div></div><div class="mvp-donation-grid">${cards || empty('Sin publicaciones disponibles', donor ? 'Publica un alimento para comenzar.' : 'Vuelve pronto para consultar nuevas publicaciones.')}</div>` : `<div class="mvp-message neutral"><i class="fa-solid fa-database"></i> Los conteos provienen de los registros de PostgreSQL. Seguimiento, custodia e incidencias operan con registros persistentes. Verificaciones documentales y reportes avanzados continúan pendientes.</div>`}`, 'Vista general');
  }
  function remaining(value) {
    if (!value) return 'Límite no declarado';
    const minutes = Math.floor((new Date(value) - Date.now()) / 60000);
    if (minutes <= 0) return 'Ventana declarada finalizada';
    return minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min disponibles` : `${minutes} min disponibles`;
  }
  function foodVisual(category) {
    const c = String(category || '').toLowerCase();
    return c.includes('pan') ? ['bread', 'fa-bread-slice', 'Del horno a otra mesa.'] : c.includes('frut') ? ['fruit', 'fa-apple-whole', 'Comparte lo bueno.'] : c.includes('verd') ? ['vegetable', 'fa-carrot', 'Más vida, menos desperdicio.'] : c.includes('láct') || c.includes('lact') ? ['dairy', 'fa-bottle-water', 'Una oportunidad de ayudar.'] : ['prepared', 'fa-bowl-food', 'Un alimento. Un nuevo destino.'];
  }
  function donationCard(d) {
    const [tone, icon, caption] = foodVisual(d.categoria);
    const evaluation = state.evaluations.get(String(d.id_donacion))?.evaluacion;
    return `<article class="mvp-donation-card"><div class="food-visual ${tone}"><div class="food-visual-rings"></div><span class="food-category">${escape(d.categoria)}</span><i class="fa-solid ${icon}" aria-hidden="true"></i><span class="food-caption">${caption}</span>${d.requiere_cadena_frio ? '<span class="cold-tag"><i class="fa-solid fa-snowflake"></i> Cadena de frío</span>' : ''}</div><div class="donation-card-body"><div class="card-title-row"><h2>${escape(d.alimento)}</h2>${badge(d.estado)}</div><p class="donation-by">${escape(d.donante_nombre || d.donante?.nombre_establecimiento || state.profile.nombre_establecimiento || 'Establecimiento donante')}</p><div class="donation-key-facts"><strong>${number(d.cantidad)} <span>${escape(d.unidad)}</span></strong><span><i class="fa-solid fa-location-dot"></i> ${escape(d.distrito || d.donante?.distrito || 'Puno')}</span></div><div class="card-time"><i class="fa-regular fa-clock"></i><span>${remaining(d.fecha_limite_aprovechamiento_declarada || d.fecha_limite_recojo)}</span></div><p class="card-conservation"><i class="fa-solid fa-temperature-half"></i> ${escape(d.conservacion_declarada || 'Conservación no indicada')}</p><div class="mini-feasibility ${evaluation ? escape(normalized(evaluation.estado_viabilidad)) : 'insuficiente'}"><span></span>${evaluation ? escape(viabilityLabel(evaluation.estado_viabilidad)) : 'Viabilidad por calcular'}</div><div class="donation-card-actions">${action('Ver detalles', 'detail', `data-id="${d.id_donacion}"`, 'btn-primary')}${action('<i class="fa-solid fa-route"></i> Ver ruta', 'route', `data-id="${d.id_donacion}"`, 'btn-secondary')}</div></div></article>`;
  }
  function filteredDonations() {
    const f = state.filters;
    return state.donations.filter(d => (!f.q || `${d.alimento} ${d.donante_nombre || ''} ${d.descripcion || ''}`.toLocaleLowerCase('es').includes(f.q.toLocaleLowerCase('es'))) && (!f.categoria || d.categoria === f.categoria) && (!f.distrito || String(d.distrito || d.donante?.distrito || '').toLowerCase().includes(f.distrito.toLowerCase())) && (!f.estado || normalized(d.estado) === f.estado));
  }
  function renderDonations() {
    const donor = role === 'donante';
    const categories = [...new Set(state.donations.map(d => d.categoria))];
    setContent(`${heading(donor ? 'Comparte alimentos. Multiplica oportunidades.' : role === 'administrador' ? 'Donaciones de la red' : 'Encuentra alimentos con un nuevo destino.', donor ? 'Gestiona tus publicaciones y las solicitudes que reciben.' : 'Explora las condiciones declaradas y planifica el traslado antes de solicitar.', donor ? action('<i class="fa-solid fa-plus"></i> Publicar donación', 'navigate', 'data-target="nueva-donacion"', 'btn-primary') : '')}<div class="mvp-filter-panel"><label class="search-field"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-filter="q" value="${escape(state.filters.q)}" placeholder="Buscar alimento o establecimiento" aria-label="Buscar alimento o establecimiento"></label><label class="sr-only" for="filter-category">Categoría</label><select id="filter-category" data-filter="categoria"><option value="">Todas las categorías</option>${categories.map(c => `<option ${state.filters.categoria === c ? 'selected' : ''}>${escape(c)}</option>`).join('')}</select><label class="sr-only" for="filter-district">Distrito</label><input id="filter-district" data-filter="distrito" value="${escape(state.filters.distrito)}" placeholder="Distrito" aria-label="Filtrar por distrito">${role !== 'organizacion' ? `<select data-filter="estado" aria-label="Estado"><option value="">Todos los estados</option>${['disponible', 'en_proceso', 'cancelada', 'vencida'].map(s => `<option value="${s}" ${state.filters.estado === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>` : ''}${action('<i class="fa-solid fa-rotate"></i>', 'refresh', 'aria-label="Actualizar donaciones"', 'btn-icon btn-secondary')}</div><div class="results-line"><strong data-results-count></strong><span>Información declarada por los donantes</span></div><div class="mvp-donation-grid" data-donation-results></div>`, donor ? 'Mis donaciones' : 'Donaciones');
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
    setContent(`${heading(d.alimento, `${d.categoria} · Publicación #${d.id_donacion}`, action('<i class="fa-solid fa-arrow-left"></i> Volver', 'navigate', `data-target="${donor ? 'mis-donaciones' : role === 'administrador' ? 'donaciones' : 'disponibles'}"`))}<div class="mvp-detail-layout"><div class="detail-main"><article class="mvp-panel detail-summary"><div class="card-title-row"><span class="section-kicker">INFORMACIÓN DE LA DONACIÓN</span>${badge(d.estado)}</div><div class="detail-quantity">${number(d.cantidad)} <span>${escape(d.unidad)}</span></div><p>${escape(d.descripcion || 'Sin descripción adicional.')}</p><dl class="mvp-definition-grid">${pair('Donante', d.donante_nombre || d.donante?.nombre_establecimiento || 'Establecimiento')}${pair('Disponible desde', date(d.fecha_disponibilidad))}${pair('Límite de recojo', date(d.fecha_limite_recojo))}${pair('Límite de aprovechamiento declarado', date(d.fecha_limite_aprovechamiento_declarada))}${pair('Dirección de recojo', d.direccion_recojo)}${pair('Solicitudes recibidas', d.solicitudes_count ?? related.length)}</dl>${d.donante?.es_demostracion ? '<div class="mvp-message neutral demo-location-note"><i class="fa-solid fa-flask"></i> Ubicación de demostración: el marcador corresponde a un punto público de Puno; no a un establecimiento real.</div>' : ''}${donor && !editable && normalized(d.estado) === 'disponible' ? '<p class="small-muted">La edición se bloquea mientras existan solicitudes activas. Si cambiaron las condiciones, puedes cancelar con un motivo.</p>' : ''}<div class="detail-actions">${editable ? action('<i class="fa-regular fa-pen-to-square"></i> Editar donación', 'edit', `data-id="${id}"`) : ''}${cancelable ? action('Cancelar donación', 'cancel-donation', `data-id="${id}"`, 'btn-danger-outline') : ''}${canRequest ? action('<i class="fa-solid fa-paper-plane"></i> Solicitar donación', 'new-request', `data-id="${id}"`, 'btn-primary') : ''}</div></article><article class="mvp-panel conservation-panel"><div class="panel-heading"><h2><i class="fa-solid fa-temperature-half"></i> Condiciones declaradas de conservación</h2></div><dl class="mvp-definition-grid">${pair('Conservación', d.conservacion_declarada || 'No declarada')}${pair('Cadena de frío', d.requiere_cadena_frio ? 'Requerida por el donante' : 'No declarada como requerida')}${pair('Envase', d.envase || 'No declarado')}${pair('Temperatura declarada', d.temperatura_declarada || 'No indicada')}${pair('Observaciones de conservación y transporte', d.observaciones || 'Sin observaciones adicionales')}</dl><div class="responsibility-note"><i class="fa-solid fa-circle-info"></i><p>Las condiciones de conservación no han sido verificadas por REAlimenta. El semáforo evalúa tiempo y logística; no certifica inocuidad.</p></div></article></div><aside><article class="mvp-panel detail-side-panel"><span class="section-kicker">ANTES DE COORDINAR</span><h2>Una ruta con información.</h2><p>El traslado empieza en el punto de recojo y termina en la organización beneficiaria.</p><div class="location-steps"><div><span class="location-dot"></span><small>ORIGEN</small><strong>${escape(d.direccion_recojo)}</strong></div><div><span class="location-dot orange"></span><small>DESTINO</small><strong>${escape(role === 'organizacion' ? state.profile.nombre || 'Mi organización' : request?.organizacion?.nombre || 'Selecciona una organización solicitante')}</strong></div></div>${action('<i class="fa-solid fa-route"></i> Ver ruta de entrega', 'scroll-route', '', 'btn-primary')}<p class="small-muted">Estimación por carretera. Sin tráfico en vivo.</p></article>${related.length ? `<article class="mvp-panel"><span class="section-kicker">SOLICITUDES VINCULADAS</span><h2>${related.length} ${related.length === 1 ? 'organización interesada' : 'solicitudes registradas'}</h2>${related.map(r => `<button class="request-route-choice ${String(r.id_solicitud) === String(request?.id_solicitud) ? 'selected' : ''}" type="button" data-action="select-route-request" data-id="${r.id_solicitud}"><strong>${escape(r.organizacion?.nombre || `Solicitud #${r.id_solicitud}`)}</strong>${badge(r.estado)}</button>`).join('')}</article>` : ''}</aside></div><section class="mvp-panel route-workspace" id="route-workspace"><div class="panel-heading"><div><span class="section-kicker">MAPAS QUE CONECTAN OPORTUNIDADES</span><h2>Evaluación del traslado</h2></div><span class="route-source-tag"><i class="fa-solid fa-map-location-dot"></i> Ruta real por carretera</span></div><div class="route-workspace-grid"><div><div class="map-surface route-map" id="delivery-map"><div class="map-placeholder"><i class="fa-solid fa-route"></i><strong>Conoce el camino antes de coordinar</strong><span>Calcula la ruta para visualizar origen, destino y recorrido.</span></div></div><div class="route-provider" data-route-provider>La ruta se consulta a un servicio externo. Los resultados incluyen proveedor y hora de cálculo.</div></div><div class="route-controls"><h3>Ajusta tu planificación</h3><form id="route-form"><div class="form-grid"><label>Preparación (min)<input class="form-control" type="number" name="preparacion_min" value="10" min="0" max="1440" required></label><label>Recojo (min)<input class="form-control" type="number" name="recojo_min" value="10" min="0" max="1440" required></label><label>Entrega (min)<input class="form-control" type="number" name="entrega_min" value="5" min="0" max="1440" required></label><label>Margen logístico (min)<input class="form-control" type="number" name="margen_seguridad_min" value="15" min="0" max="1440" required></label></div><label class="check-row"><input type="checkbox" name="dispone_cadena_frio" ${request?.dispone_cadena_frio ? 'checked' : ''}><span>La organización declara medios para mantener cadena de frío</span></label><p class="small-muted">Los tiempos de preparación, recojo, entrega y margen son configurables; no son límites sanitarios.</p><button class="btn btn-primary" type="submit"><i class="fa-solid fa-route"></i> Calcular ruta y evaluar</button><div class="mvp-message error" data-route-error tabindex="-1" hidden></div></form></div></div><div id="route-evaluation">${renderEvaluation(null)}</div></section>${donor || role === 'administrador' ? `<div class="detail-bottom-actions">${action('Ver todas las solicitudes <i class="fa-solid fa-arrow-right"></i>', 'navigate', 'data-target="solicitudes"')}</div>` : ''}`, 'Detalle de donación');
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
  function displayRoute(result) {
    $('#route-evaluation').innerHTML = REAPresentation.comparison(result) + renderEvaluation(result);
    if (result.ruta?.geometry) REAMaps.showRoute($('#delivery-map'), result.ruta);
    $('[data-route-provider]').textContent = result.ruta ? `${result.ruta.proveedor || result.ruta.proveedor_ruta || 'Proveedor de rutas'} · Calculada: ${date(result.ruta.fecha_calculo)} · Duración estimada sin tráfico en vivo.` : 'Sin ruta disponible para estas ubicaciones.';
  }
  async function evaluateRoute(form) {
    if (role !== 'organizacion' && !state.selectedRequest && !form.id_organizacion?.value) throw new Error('Selecciona una organización de destino para evaluar su recorrido.');
    const body = Object.fromEntries(['preparacion_min', 'recojo_min', 'entrega_min', 'margen_seguridad_min','demora_trafico_min'].map(key => [key, Number(form.elements.namedItem(key)?.value||0)]));
    body.dispone_cadena_frio = form.dispone_cadena_frio.checked;
    if (state.selectedRequest) { body.id_solicitud = state.selectedRequest.id_solicitud; body.fecha_propuesta = state.selectedRequest.fecha_propuesta; }
    else if (role !== 'organizacion') body.id_organizacion=Number(form.id_organizacion.value);
    const result = await REA.request(`/api/donaciones/${state.selected.id_donacion}/evaluacion`, { method: 'POST', body });
    state.evaluations.set(`${state.selected.id_donacion}:${state.selectedRequest?.id_solicitud || 'org'}`, result.data);
    if (role === 'organizacion') state.evaluations.set(String(state.selected.id_donacion), result.data);
    displayRoute(result.data);
  }
  function localInputDate(value, addHours = 0) {
    const d = value ? new Date(value) : new Date(Date.now() + addHours * 3600000);
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(' ', 'T');
  }
  function geographicFields(p, forDonation = false) {
    return `<div class="geographic-fields form-grid">${forDonation ? '' : `<label>Departamento<input class="form-control" name="departamento" value="${escape(p.departamento || 'Puno')}" required></label><label>Provincia<input class="form-control" name="provincia" value="${escape(p.provincia || 'Puno')}" required></label>`}<label>Distrito<input class="form-control" name="distrito" value="${escape(p.distrito || '')}" required></label><label class="${forDonation ? '' : 'full'}">${forDonation ? 'Dirección de recojo' : 'Dirección'}<input class="form-control" name="${forDonation ? 'direccion_recojo' : 'direccion'}" value="${escape(p.direccion_recojo || p.direccion || '')}" required></label><label class="full">Referencia<input class="form-control" name="referencia" value="${escape(p.referencia || '')}"></label><label>Latitud<input class="form-control" name="${forDonation ? 'latitud_recojo' : 'latitud'}" value="${escape(p.latitud_recojo ?? p.latitud ?? '')}" type="number" min="-90" max="90" step="any" required readonly></label><label>Longitud<input class="form-control" name="${forDonation ? 'longitud_recojo' : 'longitud'}" value="${escape(p.longitud_recojo ?? p.longitud ?? '')}" type="number" min="-180" max="180" step="any" required readonly></label></div><div class="map-search-actions">${action('<i class="fa-solid fa-magnifying-glass-location"></i> Buscar dirección en el mapa', 'search-address')}<span class="small-muted">También puedes ajustar el marcador.</span></div><div data-geocode-results class="geocode-results"></div><div class="map-surface location-map" id="location-map"></div><label class="check-row location-confirm"><input type="checkbox" name="ubicacion_confirmada" ${p.latitud != null || p.latitud_recojo != null ? 'checked' : ''} required><span>Confirmo que este punto corresponde a ${forDonation ? 'la ubicación de recojo' : 'mi establecimiento u organización'}.</span></label>`;
  }
  function mountLocation(form, p = {}, forDonation = false) {
    if (!window.REAMaps) return;
    const latName = forDonation ? 'latitud_recojo' : 'latitud';
    const lngName = forDonation ? 'longitud_recojo' : 'longitud';
    picker = REAMaps.mountPicker($('#location-map'), { latitud: p[latName] ?? p.latitud, longitud: p[lngName] ?? p.longitud, onChange: point => { form.elements.namedItem(latName).value = Number(point.latitud).toFixed(6); form.elements.namedItem(lngName).value = Number(point.longitud).toFixed(6); form.ubicacion_confirmada.checked = false; } });
  }
  function renderDonationForm(d = null) {
    const editing = Boolean(d);
    const p = d || state.profile;
    const field = (label, name, type = 'text', value = '', extra = '') => `<label>${label}<input class="form-control" name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
    const categories = [...new Set(['Panadería', 'Frutas', 'Verduras', 'Lácteos', 'Alimentos preparados', 'Abarrotes', 'Bebidas', 'Otros', ...(d?.categoria ? [d.categoria] : [])])];
    setContent(`${heading(editing ? 'Actualiza tu donación' : 'Un excedente puede ser una oportunidad.', 'Comparte información clara para que otra organización pueda planificar su recojo.')}<form id="donation-form" class="mvp-form-layout" data-id="${d?.id_donacion || ''}"><div class="mvp-form-main"><section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>01</span><div><h2>El alimento que compartes</h2><p>Describe el excedente y su presentación.</p></div></div><div class="form-grid">${field('Nombre del alimento', 'alimento', 'text', d?.alimento || '', 'required maxlength="160" placeholder="Ej. Pan integral del día"')}<label>Categoría<select class="form-control" name="categoria" required><option value="">Seleccionar categoría</option>${categories.map(c => `<option ${d?.categoria === c ? 'selected' : ''}>${escape(c)}</option>`).join('')}</select></label>${field('Cantidad', 'cantidad', 'number', d?.cantidad || '', 'min="0.01" step="0.01" required placeholder="30"')}<label>Unidad<select class="form-control" name="unidad" required>${[...new Set(['unidades', 'kg', 'litros', 'porciones', 'cajas', 'bolsas', ...(d?.unidad ? [d.unidad] : [])])].map(u => `<option ${d?.unidad === u ? 'selected' : ''}>${escape(u)}</option>`).join('')}</select></label><label class="full">Descripción / observaciones del alimento<textarea class="form-control" name="descripcion" maxlength="2500" placeholder="Presentación, características y detalles para la organización">${escape(d?.descripcion || '')}</textarea></label></div></section><section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>02</span><div><h2>Conservación y disponibilidad</h2><p>La información es declarada por ti.</p></div></div><div class="form-grid"><label>Conservación declarada<select class="form-control" name="conservacion_declarada" required>${[...new Set(['Temperatura ambiente', 'Refrigerado', 'Congelado', 'Mantener caliente', 'Otra condición declarada', ...(d?.conservacion_declarada ? [d.conservacion_declarada] : [])])].map(c => `<option ${d?.conservacion_declarada === c ? 'selected' : ''}>${escape(c)}</option>`).join('')}</select></label>${field('Envase', 'envase', 'text', d?.envase || '', 'required minlength="2" maxlength="300" placeholder="Ej. Bolsas cerradas"')}${field('Temperatura declarada (opcional)', 'temperatura_declarada', 'text', d?.temperatura_declarada || '', 'maxlength="100" placeholder="Ej. Temperatura según etiqueta del producto"')}<label class="check-row full cold-check"><input type="checkbox" name="requiere_cadena_frio" ${d?.requiere_cadena_frio ? 'checked' : ''}><span><strong>Requiere cadena de frío</strong>La organización deberá declarar sus medios de conservación durante el traslado.</span></label>${field('Disponible desde', 'fecha_disponibilidad', 'datetime-local', localInputDate(d?.fecha_disponibilidad), 'required')}${field('Fecha y hora límite de recojo', 'fecha_limite_recojo', 'datetime-local', localInputDate(d?.fecha_limite_recojo, 6), 'required')}${field('Límite de aprovechamiento declarado (opcional)', 'fecha_limite_aprovechamiento_declarada', 'datetime-local', d?.fecha_limite_aprovechamiento_declarada ? localInputDate(d.fecha_limite_aprovechamiento_declarada) : '', '')}<label class="full">Observaciones de conservación y transporte<textarea class="form-control" name="observaciones" maxlength="2500" placeholder="Información adicional declarada, sin establecer límites sanitarios">${escape(d?.observaciones || '')}</textarea></label></div><div class="responsibility-note"><i class="fa-solid fa-circle-info"></i><p>El límite de recojo es el último momento para retirar el alimento. El límite de aprovechamiento es otra fecha, declarada por el donante. No equivale a una certificación sanitaria.</p></div></section><section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>03</span><div><h2>El punto de partida</h2><p>Confirma la ubicación exacta donde se recogerá.</p></div></div>${geographicFields(p, true)}</section><div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="form-actions">${action('Cancelar', 'navigate', 'data-target="mis-donaciones"')}<button class="btn btn-primary" type="submit"><i class="fa-solid fa-${editing ? 'check' : 'paper-plane'}"></i> ${editing ? 'Guardar cambios' : 'Publicar donación'}</button></div></div><aside class="mvp-form-aside"><div class="form-guide"><span class="guide-icon"><i class="fa-solid fa-hand-holding-heart"></i></span><span class="section-kicker">LA CONFIANZA EMPIEZA CONTIGO</span><h2>Comparte con claridad.</h2><p>Una publicación completa ayuda a decidir mejor y coordinar a tiempo.</p><ul><li><i class="fa-solid fa-check"></i> Cantidad y presentación reales</li><li><i class="fa-solid fa-check"></i> Condiciones de conservación</li><li><i class="fa-solid fa-check"></i> Fechas y ubicación precisas</li></ul><p class="guide-footnote">Los criterios de conservación e inocuidad deben validarse con profesionales competentes de Nutrición e Ingeniería Agroindustrial.</p></div></aside></form>`, editing ? 'Editar donación' : 'Publicar donación');
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
    setContent(`${heading(donor ? 'Conecta tu donación con la mejor coordinación.' : role === 'administrador' ? 'Solicitudes de la red' : 'Tus oportunidades, en un solo lugar.', donor ? 'Compara las organizaciones y sus rutas antes de decidir. Solo una solicitud puede ser aceptada por donación.' : 'Consulta decisiones y condiciones de recojo. Las solicitudes son registros persistentes.', action('<i class="fa-solid fa-rotate"></i> Actualizar', 'refresh') + action('<i class="fa-solid fa-clock-rotate-left"></i> Historial de decisiones', 'navigate', 'data-target="auditoria"'))}<div class="mvp-request-tabs" role="group" aria-label="Filtrar solicitudes">${['todas', 'pendiente', 'aceptada', 'rechazada', 'cancelada'].map((s, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-request-filter="${s}">${s === 'todas' ? 'Todas' : label(s)} <span>${s === 'todas' ? state.requests.length : state.requests.filter(r => normalized(r.estado) === s).length}</span></button>`).join('')}</div><div class="mvp-requests-list" data-request-list></div>`, 'Solicitudes');
    renderRequestList();
  }
  function renderRequestList(filter = 'todas') {
    const requests = state.requests.filter(r => filter === 'todas' || normalized(r.estado) === filter);
    $('[data-request-list]').innerHTML = requests.map(r => {
      const donor = role === 'donante';
      const pending = normalized(r.estado) === 'pendiente';
      return `<article class="mvp-request-card"><div class="request-card-header"><span class="request-entity-icon"><i class="fa-solid ${donor ? 'fa-people-roof' : 'fa-store'}"></i></span><div><span class="section-kicker">SOLICITUD #${r.id_solicitud} · DONACIÓN #${r.id_donacion || r.donacion?.id_donacion}</span><h2>${escape(donor || role === 'administrador' ? r.organizacion?.nombre || 'Organización beneficiaria' : r.donante?.nombre_establecimiento || 'Establecimiento donante')}</h2></div>${badge(r.estado)}</div><div class="request-card-content"><div><h3>${escape(r.donacion?.alimento || 'Alimento publicado')}</h3><p>${escape(r.observaciones || 'Sin observaciones adicionales.')}</p><dl class="request-facts">${pair('Responsable del recojo', r.responsable_recojo)}${pair('Fecha propuesta', date(r.fecha_propuesta))}${pair('Transporte declarado', r.transporte_declarado)}${pair('Recipiente declarado', r.recipiente_declarado)}</dl></div><div class="request-card-actions">${action('<i class="fa-solid fa-route"></i> Ver ruta de entrega', 'request-detail', `data-id="${r.id_solicitud}"`)}${donor && pending ? action('<i class="fa-solid fa-check"></i> Aceptar solicitud', 'accept-request', `data-id="${r.id_solicitud}"`, 'btn-primary') + action('Rechazar', 'reject-request', `data-id="${r.id_solicitud}"`, 'btn-danger-outline') : role === 'organizacion' && pending ? action('Cancelar solicitud', 'cancel-request', `data-id="${r.id_solicitud}"`, 'btn-danger-outline') : ''}</div></div>${r.motivo_decision || r.motivo ? `<p class="decision-note"><i class="fa-solid fa-comment"></i> ${escape(r.motivo_decision || r.motivo)}</p>` : ''}<div class="request-card-footer"><span>Registrada ${date(r.fecha_creacion)}</span><span><i class="fa-solid fa-shield-halved"></i> Decisiones con auditoría</span></div></article>`;
    }).join('') || empty('Aún no hay solicitudes aquí', role === 'donante' ? 'Las organizaciones interesadas en tus publicaciones aparecerán en esta vista.' : 'Encuentra una donación y envía una solicitud para comenzar.');
  }
  function newRequestModal() {
    const d = state.selected;
    openDialog(`Solicitar ${d.alimento}`, `<form id="request-form"><p class="dialog-intro">Solicitas ${number(d.cantidad)} ${escape(d.unidad)}. El donante revisará tu propuesta; el envío no reserva automáticamente la donación.</p><div class="form-grid"><label>Responsable del recojo<input class="form-control" name="responsable_recojo" value="${escape(state.user.nombre)}" required maxlength="160"></label><label>Teléfono<input class="form-control" name="telefono" type="tel" minlength="6" value="${escape(state.user.telefono || '')}" required maxlength="30"></label><label class="full">Fecha y hora propuesta<input class="form-control" name="fecha_propuesta" type="datetime-local" value="${localInputDate(null, 1)}" required></label><label class="full">Transporte declarado<input class="form-control" name="transporte_declarado" required placeholder="Ej. Vehículo con espacio y condiciones para el alimento" maxlength="300"></label><label class="full">Recipiente declarado<input class="form-control" name="recipiente_declarado" required placeholder="Ej. Contenedor con tapa o envase original" maxlength="300"></label><label class="full">Observaciones para el donante<textarea class="form-control" name="observaciones" maxlength="2500" placeholder="¿Cómo coordinarán el recojo?"></textarea></label></div><label class="check-row"><input type="checkbox" name="dispone_cadena_frio"><span>Declaro medios para mantener cadena de frío durante el traslado</span></label>${d.requiere_cadena_frio ? '<div class="mvp-message warning">Esta donación requiere cadena de frío según lo declarado por el donante.</div>' : ''}<div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="dialog-actions">${action('Volver', 'close-dialog')}<button class="btn btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Enviar solicitud</button></div></form>`);
  }
  function decisionDialog(type, id) {
    const titles = { 'cancel-donation': 'Cancelar donación', 'accept-request': 'Aceptar solicitud', 'reject-request': 'Rechazar solicitud', 'cancel-request': 'Cancelar solicitud' };
    openDialog(titles[type], `<form id="decision-form" data-type="${type}" data-id="${id}"><p class="dialog-intro">${type === 'accept-request' ? 'La solicitud seleccionada quedará aceptada. Las demás pendientes de la misma donación serán rechazadas como no seleccionadas, y la donación pasará a En proceso.' : 'Esta operación actualizará el registro y conservará la decisión en el historial.'}</p>${type === 'accept-request' ? '' : '<label>Motivo<textarea class="form-control" name="motivo" required minlength="5" maxlength="1000" placeholder="Explica brevemente el motivo"></textarea></label>'}<div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="dialog-actions">${action('Volver', 'close-dialog')}<button type="submit" class="btn ${type === 'accept-request' ? 'btn-primary' : 'btn-danger'}">${titles[type]}</button></div></form>`);
  }
  async function renderProfile() {
    const result = await REA.request('/api/perfil');
    const user = result.data.usuario;
    const p = result.data.perfil || {};
    state.profile = p;
    setContent(`${heading(role === 'donante' ? 'El origen de nuevas oportunidades.' : role === 'organizacion' ? 'Tu comunidad, en el mapa.' : 'Mi perfil', 'Mantén actualizados tu contacto y el punto que se utilizará para calcular las rutas.')}<form id="profile-form" class="mvp-form-layout"><div class="mvp-form-main"><section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>01</span><div><h2>Información de contacto</h2><p>${escape(user.correo)} · ${role === 'administrador' ? 'Administración' : label(p.estado_verificacion || 'pendiente')}</p></div></div><div class="form-grid"><label>Nombre del responsable<input class="form-control" name="nombre" value="${escape(user.nombre)}" required></label><label>Teléfono<input class="form-control" name="telefono" type="tel" minlength="6" value="${escape(user.telefono || '')}" required></label>${role !== 'administrador' ? `<label class="full">${role === 'donante' ? 'Nombre del establecimiento' : 'Nombre de la organización'}<input class="form-control" name="entidad" value="${escape(p.nombre_establecimiento || p.nombre || '')}" required></label>` : ''}</div></section>${role !== 'administrador' ? `<section class="mvp-panel form-section-panel"><div class="form-section-heading"><span>02</span><div><h2>Ubicación confirmada</h2><p>Marca el punto exacto del establecimiento u organización.</p></div></div>${geographicFields(p)}</section>` : ''}<div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="form-actions"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-check"></i> Guardar perfil</button></div></div><aside class="mvp-form-aside"><div class="form-guide"><span class="guide-icon"><i class="fa-solid fa-location-dot"></i></span><h2>La dirección importa.</h2><p>Una ubicación confirmada ayuda a calcular rutas por carretera y evaluar mejor los tiempos de traslado.</p><p class="guide-footnote">La verificación administrativa es un proceso independiente. Guardar este perfil no modifica tu estado de verificación.</p></div></aside></form>`, 'Mi perfil');
    if (role !== 'administrador') mountLocation($('#profile-form'), p);
  }
  async function renderAudit() {
    const result = await REA.request('/api/auditoria');
    const rows = result.data || [];
    setContent(`${heading('Cada decisión deja una huella.', 'Historial persistente de publicaciones, solicitudes y cambios registrados por el servidor.')}<div class="mvp-panel table-wrap"><table class="data-table"><thead><tr><th>Fecha y hora</th><th>Entidad</th><th>Referencia</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${rows.map(row => `<tr><td>${date(row.fecha_evento)}</td><td>${escape(row.entidad)}</td><td>#${escape(row.id_entidad)}</td><td>${escape(row.accion)}</td><td class="audit-detail">${escape(typeof row.detalle === 'string' ? row.detalle : JSON.stringify(row.detalle || {}))}</td></tr>`).join('') || '<tr><td colspan="5">Todavía no hay eventos registrados.</td></tr>'}</tbody></table></div>`, 'Historial de cambios');
  }
  function renderPending(view) {
    const modules = { seguimiento: ['Seguimiento y cadena de custodia', 'Se conserva el diseño conceptual de preparación, recojo, traslado, entrega y confirmación. Los hitos operativos y las transferencias de custodia aún no se registran en esta versión.', 'fa-route'], notificaciones: ['Centro de notificaciones', 'Los avisos automáticos y las preferencias de comunicación están pendientes. Consulta el estado real de tus operaciones en Donaciones y Solicitudes.', 'fa-bell'], incidencias: ['Incidencias', 'El registro, asignación y resolución de incidencias se desarrollará en el siguiente incremento.', 'fa-triangle-exclamation'], verificaciones: ['Verificación administrativa', 'La revisión documental y aprobación de nuevas cuentas aún no están habilitadas. Las cuentas de prueba se verifican mediante datos de semilla identificados.', 'fa-user-check'], reportes: ['Reportes e impacto', 'Los informes exportables y las métricas de impacto están pendientes. La vista general muestra únicamente conteos de registros existentes.', 'fa-chart-column'], usuarios: ['Gestión de usuarios', 'La administración de cuentas, bloqueos y permisos avanzados está prevista para el siguiente incremento.', 'fa-users'], donantes: ['Directorio de donantes', 'La edición administrativa del directorio está pendiente. Los donantes acceden a la gestión real de su perfil y de sus publicaciones.', 'fa-store'], organizaciones: ['Directorio de organizaciones', 'La administración del directorio está pendiente. Cada organización puede actualizar su ubicación y consultar sus solicitudes reales.', 'fa-people-roof'], configuracion: ['Configuración', 'Las preferencias administrativas avanzadas se configurarán en una próxima versión. Los proveedores y umbrales actuales se definen en el entorno del servidor.', 'fa-gear'] };
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
        case 'route': await navigate('detalle', { id }); $('#route-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
        case 'scroll-route': $('#route-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
        case 'edit': state.current = 'nueva-donacion'; renderDonationForm(state.selected); break;
        case 'cancel-donation': case 'accept-request': case 'reject-request': case 'cancel-request': decisionDialog(button.dataset.action, id); break;
        case 'new-request': newRequestModal(); break;
        case 'request-detail': { const request = state.requests.find(r => String(r.id_solicitud) === String(id)); await navigate('detalle', { id: request.id_donacion || request.donacion.id_donacion, request }); break; }
        case 'select-route-request': { const request = state.requests.find(r => String(r.id_solicitud) === String(id)); await navigate('detalle', { id: state.selected.id_donacion, request }); $('#route-workspace').scrollIntoView({ behavior: 'smooth' }); break; }
        case 'close-dialog': closeDialog(); break;
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
    if (!['donation-form', 'request-form', 'decision-form', 'profile-form', 'route-form'].includes(form.id)) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    const original = submit.innerHTML;
    submit.disabled = true; submit.innerHTML = '<span class="loading-spinner small"></span> Procesando…';
    const errors = form.querySelector('[data-form-error], [data-route-error]');
    if (errors) errors.hidden = true;
    try {
      if (form.id === 'route-form') { await evaluateRoute(form); return; }
      if (form.id === 'donation-form') {
        const values = Object.fromEntries(new FormData(form));
        delete values.foto;
        const body = { ...values, cantidad: Number(values.cantidad), latitud_recojo: Number(values.latitud_recojo), longitud_recojo: Number(values.longitud_recojo), requiere_cadena_frio: form.requiere_cadena_frio.checked, ubicacion_confirmada: form.ubicacion_confirmada.checked };
        for (const field of ['fecha_disponibilidad', 'fecha_limite_recojo', 'fecha_limite_aprovechamiento_declarada']) body[field] = values[field] ? new Date(`${values[field]}:00-05:00`).toISOString() : null;
        if (new Date(body.fecha_disponibilidad) >= new Date(body.fecha_limite_recojo)) throw new Error('El límite de recojo debe ser posterior a la disponibilidad.');
        if (body.fecha_limite_aprovechamiento_declarada && new Date(body.fecha_limite_aprovechamiento_declarada) < new Date(body.fecha_limite_recojo)) throw new Error('El límite de aprovechamiento declarado no puede ser anterior al límite de recojo.');
        const id = form.dataset.id;
        const result = await REA.request(`/api/donaciones${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body });
        form.dataset.id=result.data.id_donacion;
        try{await REAImages.upload(result.data.id_donacion,form);}catch(photoError){throw new Error(`La donación #${result.data.id_donacion} ya está guardada, pero faltó subir una foto: ${photoError.message} Puedes reintentar guardar sin crear otra donación.`);}
        await loadData();
        toast(id ? 'Cambios guardados en tu donación.' : 'Tu donación ya está publicada.');
        await navigate('detalle', { id: result.data.id_donacion });
      } else if (form.id === 'request-form') {
        const values = Object.fromEntries(new FormData(form));
        values.fecha_propuesta = new Date(`${values.fecha_propuesta}:00-05:00`).toISOString();
        values.dispone_cadena_frio = form.dispone_cadena_frio.checked;
        await REA.request(`/api/donaciones/${state.selected.id_donacion}/solicitudes`, { method: 'POST', body: values });
        closeDialog(); await loadData(); await navigate('solicitudes'); toast('Solicitud enviada. El donante podrá revisarla.');
      } else if (form.id === 'decision-form') {
        const id = form.dataset.id;
        const type = form.dataset.type;
        const route = { 'cancel-donation': `/api/donaciones/${id}/cancelar`, 'accept-request': `/api/solicitudes/${id}/aceptar`, 'reject-request': `/api/solicitudes/${id}/rechazar`, 'cancel-request': `/api/solicitudes/${id}/cancelar` }[type];
        await REA.request(route, { method: 'POST', body: { motivo: form.motivo?.value.trim() || '' } });
        closeDialog(); await loadData(); await navigate(type === 'cancel-donation' ? 'mis-donaciones' : 'solicitudes'); toast('Decisión guardada correctamente.');
      } else if (form.id === 'profile-form') {
        const values = Object.fromEntries(new FormData(form));
        const perfil = role === 'administrador' ? {} : { departamento: values.departamento, provincia: values.provincia, distrito: values.distrito, direccion: values.direccion, referencia: values.referencia, latitud: Number(values.latitud), longitud: Number(values.longitud), ubicacion_confirmada: form.ubicacion_confirmada.checked, responsable: values.nombre };
        if (role !== 'administrador') perfil[role === 'donante' ? 'nombre_establecimiento' : 'nombre'] = values.entidad;
        const result = await REA.request('/api/perfil', { method: 'PATCH', body: { nombre: values.nombre, telefono: values.telefono, perfil } });
        state.user = { ...state.user, ...result.data.usuario }; state.profile = result.data.perfil || {}; state.evaluations.clear(); identity(); toast('Perfil y ubicación guardados.');
      }
    } catch (error) { showError(error, errors); if (form.id === 'route-form') { $('#route-evaluation').innerHTML = renderEvaluation(null); $('#delivery-map').innerHTML = '<div class="map-placeholder"><i class="fa-solid fa-route"></i><strong>No se pudo calcular una ruta para estas ubicaciones</strong><span>Comprueba los datos y vuelve a intentarlo.</span></div>'; $('[data-route-provider]').textContent = 'Sin cálculo de ruta disponible. No se muestran distancia ni duración ficticias.'; } }
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
