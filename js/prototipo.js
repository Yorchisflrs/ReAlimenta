/* Ampliaciones visuales de REAlimenta. Todo vive en memoria y se reinicia al recargar.
   No existe backend, certificación alimentaria ni monitoreo de temperatura. */
document.addEventListener('DOMContentLoaded', () => {
  const role = document.body.dataset.role;
  if (!['donante', 'organizacion', 'administrador'].includes(role)) return;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const today = new Date();
  const isoDate = (offset = 0) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const displayDate = (offset = 0) => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  const nowLabel = () => new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const currentYear = today.getFullYear();

  const stages = [
    'Publicada', 'Solicitud recibida', 'Solicitud aceptada', 'Preparando para recojo',
    'Lista para recojo', 'En recojo', 'En traslado', 'Entregada',
    'Recepción confirmada', 'Finalizada'
  ];
  const exceptional = ['Expirada', 'Cancelada', 'Solicitud rechazada', 'No recogida', 'Incidencia registrada'];
  let trackingIndex = 4;
  const incidents = [];
  let deliveryNotes = '';
  let receptionNotes = '';

  const catalog = [
    { id: 'DON-101', food: 'Pan integral', category: 'Panadería', key: 'panaderia', icon: 'fa-bread-slice', gradient: 'linear-gradient(145deg,#cfac70,#a7763b)', amount: 30, unit: 'unidades', donor: 'Panadería San Carlos', responsible: 'Carlos Quispe', phone: '+51 951 234 567', location: 'Puno', address: 'Jr. Lima 458, Puno', reference: 'Puerta lateral', condition: 'Temperatura ambiente', cold: false, temperature: 'No indicada', productStatus: 'Apto para recojo', made: displayDate(), expires: 'No indicada', deadline: `Hoy · 18:00`, hours: '15:00 – 18:00', package: 'Bolsa', packageState: 'Empacado', packageCount: '6 bolsas', provider: 'Donante', pickup: 'Recojo en el establecimiento', pickupNotes: 'Preguntar por Carlos en caja.', foodNotes: 'Pan integral del día.', conservationNotes: 'Mantener en lugar fresco, según declaración del donante.', packageNotes: 'Bolsas de cinco unidades.', requests: 3 },
    { id: 'DON-102', food: 'Frutas variadas', category: 'Frutas', key: 'frutas', icon: 'fa-apple-whole', gradient: 'linear-gradient(145deg,#8dbb56,#3c8f58)', amount: 20, unit: 'kg', donor: 'Mercado Central Puno', responsible: 'Pedro Flores', phone: '+51 954 111 205', location: 'Puno', address: 'Av. El Sol 250, Puno', reference: 'Ingreso de proveedores', condition: 'Lugar fresco', cold: false, temperature: 'No indicada', productStatus: 'Próximo a fecha límite', made: 'No corresponde', expires: 'No indicada', deadline: 'Hoy · 17:00', hours: '14:00 – 17:00', package: 'Caja', packageState: 'Empacado', packageCount: '4 cajas', provider: 'Donante', pickup: 'Recojo en el establecimiento', pickupNotes: 'Ingresar por zona de carga.', foodNotes: 'Selección de frutas de temporada.', conservationNotes: 'Conservar en lugar fresco, según declaración del donante.', packageNotes: 'Cajas reutilizables del mercado.', requests: 1 },
    { id: 'DON-103', food: 'Leche pasteurizada', category: 'Lácteos', key: 'lacteos', icon: 'fa-bottle-water', gradient: 'linear-gradient(145deg,#7bb1cd,#467995)', amount: 15, unit: 'litros', donor: 'Panadería San Carlos', responsible: 'Carlos Quispe', phone: '+51 951 234 567', location: 'Puno', address: 'Jr. Lima 458, Puno', reference: 'Puerta lateral', condition: 'Refrigerado', cold: true, temperature: '2 °C – 5 °C (indicada por el donante)', productStatus: 'Apto para recojo', made: 'No indicada', expires: displayDate(1), deadline: 'Hoy · 17:00', hours: '14:00 – 17:00', package: 'Envase original', packageState: 'Sellado', packageCount: '15 envases', provider: 'Donante', pickup: 'Recojo en el establecimiento', pickupNotes: 'Traer transporte y recipiente adecuados según lo declarado.', foodNotes: 'Envases originales sin abrir, según el donante.', conservationNotes: 'Mantener refrigerado hasta el recojo, según el donante.', packageNotes: 'Entregar en envase original.', requests: 1 },
    { id: 'DON-104', food: 'Arroz con verduras', category: 'Alimentos preparados', key: 'preparados', icon: 'fa-bowl-food', gradient: 'linear-gradient(145deg,#dd8454,#a94535)', amount: 20, unit: 'porciones', donor: 'Restaurante Lago Azul', responsible: 'Elena Mamani', phone: '+51 951 400 110', location: 'Puno', address: 'Jr. Arequipa 210, Puno', reference: 'Ingreso de cocina', condition: 'Mantener caliente', cold: false, temperature: 'No indicada', productStatus: 'Requiere consumo inmediato', made: displayDate(), expires: 'No indicada', deadline: 'Hoy · 15:30', hours: '13:30 – 15:30', package: 'Recipiente térmico', packageState: 'Requiere recipiente del beneficiario', packageCount: '2 recipientes', provider: 'Organización beneficiaria', pickup: 'Recojo en el establecimiento', pickupNotes: 'Traer dos contenedores con tapa.', foodNotes: 'Preparación del día, según el donante.', conservationNotes: 'Condición declarada por el donante; pendiente de validación técnica.', packageNotes: 'Recipientes aportados por la organización.', requests: 0 },
    { id: 'DON-105', food: 'Galletas de avena', category: 'Panadería', key: 'panaderia', icon: 'fa-cookie-bite', gradient: 'linear-gradient(145deg,#cc9b65,#9d6134)', amount: 8, unit: 'bolsas', donor: 'Panadería Delicias del Sur', responsible: 'Julia Paredes', phone: '+51 986 111 020', location: 'Juliaca', address: 'Jr. Comercio 118, Juliaca', reference: 'Mostrador principal', condition: 'Temperatura ambiente', cold: false, temperature: 'No indicada', productStatus: 'Apto para recojo', made: displayDate(), expires: 'No indicada', deadline: 'Mañana · 12:00', hours: '09:00 – 12:00', package: 'Bolsa', packageState: 'Cerrado', packageCount: '8 bolsas', provider: 'Donante', pickup: 'Punto de encuentro', pickupNotes: 'Confirmar hora con el donante.', foodNotes: 'Galletas empacadas.', conservationNotes: 'Mantener en lugar seco, según el donante.', packageNotes: 'Bolsas cerradas.', requests: 0 },
    { id: 'DON-106', food: 'Verduras de temporada', category: 'Verduras', key: 'verduras', icon: 'fa-carrot', gradient: 'linear-gradient(145deg,#77a348,#416f38)', amount: 22, unit: 'kg', donor: 'Mercado Central Puno', responsible: 'Pedro Flores', phone: '+51 954 111 205', location: 'Puno', address: 'Av. El Sol 250, Puno', reference: 'Ingreso de proveedores', condition: 'Lugar fresco', cold: false, temperature: 'No indicada', productStatus: 'Apto para recojo', made: 'No corresponde', expires: 'No indicada', deadline: 'Hoy · 19:00', hours: '16:00 – 19:00', package: 'Caja', packageState: 'Empacado', packageCount: '3 cajas', provider: 'Donante', pickup: 'Recojo en el establecimiento', pickupNotes: 'Acudir al módulo de carga.', foodNotes: 'Verduras surtidas.', conservationNotes: 'Lugar fresco declarado por el donante.', packageNotes: 'Cajas del mercado.', requests: 0 }
  ];

  const donorRequests = [
    { id: 'SOL-101', donation: 'DON-101', organization: 'Comedor Popular Virgen del Carmen', person: 'Juan Pérez', phone: '+51 952 345 678', amount: '20 unidades', beneficiaries: 65, pickup: 'Hoy · 16:00', transport: 'Sí', container: 'Sí', message: 'Podemos recoger el pan antes de las 16:00.', status: 'Pendiente' },
    { id: 'SOL-102', donation: 'DON-101', organization: 'Olla Común Santa Rosa', person: 'Lucía Flores', phone: '+51 984 221 705', amount: '20 unidades', beneficiaries: 42, pickup: 'Hoy · 16:30', transport: 'Sí', container: 'No aplica', message: 'El responsable acudirá al establecimiento.', status: 'Pendiente' },
    { id: 'SOL-103', donation: 'DON-101', organization: 'Asociación Manos Solidarias', person: 'Patricia Choque', phone: '+51 950 214 330', amount: '25 unidades', beneficiaries: 50, pickup: 'Hoy · 17:00', transport: 'Sí', container: 'Sí', message: 'Solicitamos coordinación para el recojo.', status: 'En revisión' },
    { id: 'SOL-104', donation: 'DON-103', organization: 'Comedor Popular Virgen del Carmen', person: 'Juan Pérez', phone: '+51 952 345 678', amount: '15 litros', beneficiaries: 65, pickup: 'Hoy · 16:30', transport: 'Sí', container: 'Sí', message: 'Contamos con contenedor para el traslado.', status: 'Aceptada' }
  ];
  const donorDonations = [
    { id: 'DON-101', food: 'Pan integral', amount: '30 unidades', product: 'Apto para recojo', conservation: 'Ambiente', deadline: 'Hoy · 18:00', requests: 3, status: 'Disponible', stage: 'Solicitud recibida' },
    { id: 'DON-102', food: 'Frutas variadas', amount: '20 kg', product: 'Próximo a fecha límite', conservation: 'Lugar fresco', deadline: 'Hoy · 17:00', requests: 1, status: 'Disponible', stage: 'Solicitud recibida' },
    { id: 'DON-103', food: 'Leche pasteurizada', amount: '15 litros', product: 'Apto para recojo', conservation: '❄ Refrigerado', deadline: 'Hoy · 17:00', requests: 1, status: 'En proceso', stage: 'Lista para recojo' },
    { id: 'DON-099', food: 'Arroz preparado', amount: '12 porciones', product: 'Requiere consumo inmediato', conservation: 'Mantener caliente', deadline: 'Ayer · 14:00', requests: 1, status: 'Finalizada', stage: 'Finalizada' },
    { id: 'DON-098', food: 'Pan francés', amount: '20 unidades', product: 'Próximo a fecha límite', conservation: 'Ambiente', deadline: 'Ayer · 19:00', requests: 0, status: 'Expirada', stage: '—' }
  ];
  const orgRequests = [
    { id: 'SOL-206', food: 'Frutas variadas', donor: 'Mercado Central Puno', amount: '15 kg', status: 'Pendiente', logistics: 'Sin recojo asignado' },
    { id: 'SOL-205', food: 'Pan integral', donor: 'Panadería San Carlos', amount: '20 unidades', status: 'En revisión', logistics: 'Sin recojo asignado' },
    { id: 'SOL-104', food: 'Leche pasteurizada', donor: 'Panadería San Carlos', amount: '15 litros', status: 'Aceptada', logistics: 'Lista para recojo' },
    { id: 'SOL-203', food: 'Verduras mixtas', donor: 'Mercado Central Puno', amount: '18 kg', status: 'Rechazada', logistics: 'No corresponde' },
    { id: 'SOL-202', food: 'Galletas de avena', donor: 'Panadería Delicias del Sur', amount: '8 bolsas', status: 'Cancelada', logistics: 'No corresponde' }
  ];

  const notificationSets = {
    donante: [
      { category: 'solicitudes', icon: 'fa-inbox', title: 'Nueva solicitud para Pan integral', description: 'Comedor Popular Virgen del Carmen solicita 20 unidades.', reference: 'SOL-101 · DON-101', time: 'Hoy · 10:35', unread: true, target: 'solicitudes' },
      { category: 'solicitudes', icon: 'fa-hourglass-half', title: 'Solicitud pendiente de revisión', description: 'La solicitud SOL-102 sigue pendiente de respuesta.', reference: 'SOL-102', time: 'Hoy · 10:45', unread: true, target: 'solicitudes' },
      { category: 'recojos', icon: 'fa-truck-ramp-box', title: 'Recojo programado', description: 'Juan Pérez recogerá la leche a las 16:30.', reference: 'DON-103 · SOL-104', time: 'Hoy · 11:00', unread: true, target: 'recojos' },
      { category: 'alertas', icon: 'fa-snowflake', title: 'Cadena de frío declarada', description: 'Leche pasteurizada requiere mantener la condición indicada por el donante.', reference: 'DON-103', time: 'Hoy · 11:10', unread: false, target: 'seguimiento' },
      { category: 'alertas', icon: 'fa-triangle-exclamation', title: 'Donación próxima a su hora límite', description: 'Frutas variadas estará disponible hasta las 17:00.', reference: 'DON-102', time: 'Hoy · 13:00', unread: false, target: 'mis-donaciones' },
      { category: 'sistema', icon: 'fa-circle-info', title: 'Cuenta de demostración', description: 'Las acciones de este panel no se guardan al recargar.', reference: 'Sistema', time: 'Hoy · 08:00', unread: false, target: 'dashboard' }
    ],
    organizacion: [
      { category: 'solicitudes', icon: 'fa-circle-check', title: 'Solicitud aceptada', description: 'Panadería San Carlos aceptó su solicitud de leche pasteurizada.', reference: 'SOL-104 · DON-103', time: 'Hoy · 10:20', unread: true, target: 'solicitudes' },
      { category: 'recojos', icon: 'fa-clock', title: 'Alimento listo para recojo', description: 'La leche estará lista desde las 14:00. Recojo previsto: 16:30.', reference: 'DON-103', time: 'Hoy · 11:00', unread: true, target: 'recojos' },
      { category: 'recojos', icon: 'fa-box-open', title: 'Recipiente para el recojo', description: 'Revise el envase y lleve el contenedor declarado en su solicitud.', reference: 'SOL-104', time: 'Hoy · 11:05', unread: true, target: 'recojos' },
      { category: 'alertas', icon: 'fa-snowflake', title: 'Cadena de frío declarada', description: 'Mantener la condición de conservación indicada por el donante durante el traslado.', reference: 'DON-103', time: 'Hoy · 11:10', unread: false, target: 'seguimiento' },
      { category: 'donaciones', icon: 'fa-basket-shopping', title: 'Pan integral disponible', description: 'Panadería San Carlos publicó 30 unidades en Puno.', reference: 'DON-101', time: 'Hoy · 09:00', unread: false, target: 'disponibles' },
      { category: 'sistema', icon: 'fa-circle-info', title: 'Confirmación de recepción', description: 'Después de la entrega, registre la recepción y sus observaciones.', reference: 'SOL-104', time: 'Hoy · 08:00', unread: false, target: 'seguimiento' }
    ],
    administrador: [
      { category: 'alertas', icon: 'fa-triangle-exclamation', title: 'Tres donaciones próximas a expirar', description: 'Revisar publicaciones con fecha límite cercana.', reference: 'DON-102 y otras', time: 'Hoy · 12:15', unread: true, target: 'donaciones' },
      { category: 'alertas', icon: 'fa-circle-exclamation', title: 'Dos incidencias abiertas', description: 'Se requiere seguimiento de recojo y transporte.', reference: 'INC-021 · INC-022', time: 'Hoy · 11:40', unread: true, target: 'incidencias' },
      { category: 'sistema', icon: 'fa-user-check', title: 'Verificaciones pendientes', description: 'Cuatro organizaciones esperan revisión documental.', reference: 'VER-004', time: 'Hoy · 10:10', unread: true, target: 'verificaciones' },
      { category: 'solicitudes', icon: 'fa-inbox', title: 'Solicitudes activas', description: 'Hay solicitudes pendientes y en revisión en la red.', reference: 'SOL-101', time: 'Hoy · 09:35', unread: false, target: 'solicitudes' },
      { category: 'recojos', icon: 'fa-truck', title: 'Recojo programado', description: 'Leche pasteurizada: recojo previsto para las 16:30.', reference: 'DON-103', time: 'Hoy · 09:00', unread: false, target: 'seguimientos' },
      { category: 'donaciones', icon: 'fa-box', title: 'Nueva donación', description: 'Panadería San Carlos publicó Pan integral.', reference: 'DON-101', time: 'Hoy · 08:20', unread: false, target: 'donaciones' }
    ]
  };

  const badge = (value) => `<span class="proto-badge proto-${String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}">${escapeHTML(value)}</span>`;
  const info = (label, value) => `<div class="info-item"><small>${escapeHTML(label)}</small><strong>${escapeHTML(value)}</strong></div>`;
  const sectionTitle = (icon, title, subtitle = '') => `<div class="proto-section-head"><span class="proto-section-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div></div>`;
  const head = (title, text, actions = '') => `<div class="page-header"><div><span class="status-note">Prototipo demostrativo</span><h1>${title}</h1><p>${text}</p></div>${actions}</div>`;
  const stat = (icon, number, label, caption, accent = '#21845f') => `<article class="stat-card" style="--accent:${accent};--tint:#e9f5ed"><div class="stat-card-head"><span class="stat-icon"><i class="fa-solid ${icon}"></i></span><span class="stat-trend">${caption}</span></div><strong>${number}</strong><span>${label}</span></article>`;
  const actionButton = (label, action, extra = '', style = 'btn-secondary') => `<button type="button" class="btn ${style} btn-sm" data-proto-action="${action}" ${extra}>${label}</button>`;

  function mount(name, html) {
    const section = $(`[data-view-section="${name}"]`);
    if (section) section.innerHTML = html;
    return section;
  }
  function addView(name, title, html, before = null) {
    const view = document.createElement('section');
    view.className = 'app-view';
    view.dataset.viewSection = name;
    view.dataset.title = title;
    view.innerHTML = html;
    const main = $('.content');
    if (before && $(`[data-view-section="${before}"]`)) main.insertBefore(view, $(`[data-view-section="${before}"]`));
    else main.appendChild(view);
    return view;
  }
  function addNav(afterView, view, label, icon) {
    const anchor = $(`.sidebar-nav [data-view="${afterView}"]`);
    if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', `<button class="nav-item" type="button" data-proto-go="${view}"><i class="fa-solid ${icon}"></i> ${label}</button>`);
  }
  function go(name) {
    const view = $(`[data-view-section="${name}"]`);
    if (!view) return;
    $$('[data-view-section]').forEach((section) => section.classList.toggle('active', section === view));
    $$('.sidebar-nav .nav-item').forEach((item) => item.classList.toggle('active', (item.dataset.view || item.dataset.protoGo) === name));
    const breadcrumb = $('[data-breadcrumb]');
    if (breadcrumb) breadcrumb.textContent = view.dataset.title || name;
    document.title = `${view.dataset.title || name} | REAlimenta`;
    history.replaceState(null, '', `#${name}`);
    $('#app-sidebar')?.classList.remove('open');
    $('[data-sidebar-overlay]')?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function toast(message) {
    const host = $('.toast-container');
    if (!host) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.setAttribute('role', 'status');
    item.innerHTML = '<span class="toast-icon"><i class="fa-solid fa-circle-info"></i></span><span><strong>Demostración</strong><span></span></span><button class="toast-close" type="button" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>';
    $('span span', item).textContent = message;
    $('.toast-close', item).addEventListener('click', () => item.remove());
    host.appendChild(item);
    window.setTimeout(() => item.remove(), 4500);
  }
  function closeModal() {
    $('[data-modal-backdrop]')?.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
  function modal(title, body, buttons = [{ label: 'Cerrar', style: 'btn-secondary' }]) {
    const backdrop = $('[data-modal-backdrop]');
    if (!backdrop) return;
    $('[data-modal-title]').textContent = title;
    $('[data-modal-body]').innerHTML = body;
    const actions = $('[data-modal-actions]');
    actions.innerHTML = '';
    buttons.forEach((spec) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn ${spec.style || 'btn-secondary'}`;
      button.textContent = spec.label;
      button.addEventListener('click', () => {
        if (spec.run && spec.run() === false) return;
        closeModal();
      });
      actions.appendChild(button);
    });
    $('form', $('[data-modal-body]'))?.addEventListener('submit', (event) => event.preventDefault());
    backdrop.classList.add('open');
    document.body.classList.add('modal-open');
    window.setTimeout(() => $('input, select, textarea, button', backdrop)?.focus(), 10);
  }
  function validModal() {
    const form = $('form', $('[data-modal-body]'));
    if (form && !form.checkValidity()) { form.reportValidity(); return false; }
    return true;
  }
  function renderNotifications(filter = 'todas') {
    const set = notificationSets[role];
    const categories = [['todas', 'Todas'], ['solicitudes', 'Solicitudes'], ['recojos', 'Recojos'], ['donaciones', 'Donaciones'], ['alertas', 'Alertas'], ['sistema', 'Sistema']];
    mount('notificaciones', `${head('Centro de notificaciones', 'Avisos vinculados a solicitudes, recojos, donaciones y alertas.', actionButton('Marcar todas como leídas', 'read-all'))}
      <div class="proto-filter-row" role="group" aria-label="Filtrar notificaciones">${categories.map(([key, label]) => `<button type="button" class="filter-tab ${filter === key ? 'active' : ''}" data-proto-filter="notification" data-value="${key}">${label}</button>`).join('')}</div>
      <div class="card notification-list">${set.filter((n) => filter === 'todas' || n.category === filter).map((n, i) => `<article class="notification-item ${n.unread ? 'unread' : ''}"><span class="notification-icon"><i class="fa-solid ${n.icon}"></i></span><div class="notification-content"><div class="proto-notification-top"><h3>${escapeHTML(n.title)}</h3>${n.unread ? badge('No leída') : badge('Leída')}</div><p>${escapeHTML(n.description)}</p><div class="proto-reference"><span>${escapeHTML(n.reference)}</span><span>${escapeHTML(n.time)}</span></div></div><div class="proto-notification-actions">${actionButton('Ver', 'notification-go', `data-target="${n.target}"`)}${n.unread ? actionButton('Marcar leída', 'read-notification', `data-index="${set.indexOf(n)}"`) : ''}</div></article>`).join('') || '<div class="proto-empty">No hay notificaciones en este filtro.</div>'}</div>`);
    const unreadCount = set.filter((item) => item.unread).length;
    const counter = $('.sidebar-nav [data-view="notificaciones"] .nav-badge');
    if (counter) { counter.textContent = unreadCount; counter.hidden = unreadCount === 0; }
    const dot = $('.notification-dot');
    if (dot) dot.hidden = unreadCount === 0;
  }

  function renderTracking() {
    const donation = catalog.find((item) => item.id === 'DON-103');
    const here = stages[trackingIndex];
    const status = trackingIndex === 9 ? 'Finalizada' : 'En proceso';
    const custody = [
      { icon: 'fa-store', title: 'En el establecimiento', responsible: donation.donor, role: 'Donante', at: trackingIndex >= 0 ? `${displayDate()} · 14:00` : 'Pendiente', observation: 'Conservación declarada por el donante.', activeAt: [0, 1, 2, 3, 4] },
      { icon: 'fa-id-card', title: 'Entrega a representante autorizado', responsible: 'Juan Pérez', role: 'Comedor Popular Virgen del Carmen', at: trackingIndex >= 5 ? `${displayDate()} · 16:30` : 'Pendiente', observation: 'Identidad y cantidad por verificar visualmente.', activeAt: [5] },
      { icon: 'fa-truck', title: 'Traslado', responsible: 'Organización beneficiaria', role: 'Transporte declarado por la organización', at: trackingIndex >= 6 ? `${displayDate()} · 16:40` : 'Pendiente', observation: 'Condiciones de conservación declaradas; sin monitoreo real.', activeAt: [6] },
      { icon: 'fa-hand-holding-heart', title: 'Recepción física', responsible: 'Rosa Condori', role: 'Organización beneficiaria', at: trackingIndex >= 7 ? `${displayDate()} · 17:00` : 'Pendiente', observation: 'Observaciones de entrega y recepción diferenciadas.', activeAt: [7] },
      { icon: 'fa-clipboard-check', title: 'Recepción confirmada', responsible: 'Rosa Condori', role: 'Organización beneficiaria', at: trackingIndex >= 8 ? `${displayDate()} · 17:10` : 'Pendiente', observation: 'Confirmación visual; sin firma digital.', activeAt: [8, 9] }
    ];
    const stageAction = role === 'administrador' ? '' : trackingIndex < 6 ? actionButton('Simular siguiente hito', 'advance-track', '', 'btn-primary') : trackingIndex === 6 ? actionButton('Registrar entrega', 'record-delivery', '', 'btn-primary') : role === 'organizacion' && trackingIndex === 7 ? actionButton('Confirmar recepción', 'confirm-reception', '', 'btn-primary') : role === 'organizacion' && trackingIndex === 8 ? actionButton('Finalizar proceso', 'finish-track', '', 'btn-primary') : '';
    mount(role === 'administrador' ? 'seguimientos' : 'seguimiento', `${head('Seguimiento y cadena de custodia', `Donación ${donation.id} · ${donation.food}. Cada hito pertenece al proceso logístico, no al estado de la solicitud.`, badge(status))}
      <div class="proto-state-strip"><span><small>Estado del producto</small><strong>${escapeHTML(donation.productStatus)}</strong></span><span><small>Estado de la donación</small><strong>${status}</strong></span><span><small>Estado de la solicitud</small><strong>Aceptada · SOL-104</strong></span><span><small>Etapa logística</small><strong>${here}</strong></span></div>
      <div class="proto-two-col"><article class="card proto-pad">${sectionTitle('fa-route', 'Etapas normales', 'Secuencia completa de la donación aceptada.')}<ol class="proto-stage-list">${stages.map((stage, index) => `<li class="${index < trackingIndex ? 'done' : index === trackingIndex ? 'current' : ''}"><span class="proto-stage-number">${index < trackingIndex ? '<i class="fa-solid fa-check"></i>' : index + 1}</span><div><strong>${stage}</strong><small>${index < trackingIndex ? 'Registrada en demostración' : index === trackingIndex ? 'Etapa actual' : 'Pendiente'}</small></div></li>`).join('')}</ol></article>
      <aside class="proto-stack"><article class="card proto-pad">${sectionTitle('fa-snowflake', 'Condiciones de conservación')}<div class="proto-badge-row">${badge('Refrigerado')}${badge('Cadena de frío')}</div><div class="proto-info-grid">${info('Temperatura indicada por el donante', donation.temperature)}${info('Envase', donation.package)}${info('Horario de recojo', donation.hours)}${info('Responsable del recojo', 'Juan Pérez · +51 952 345 678')}</div><p class="proto-disclaimer">Información declarada por el donante. Los criterios de conservación e inocuidad están pendientes de validación con profesionales de Nutrición e Ingeniería Agroindustrial.</p></article>
      <article class="card proto-pad">${sectionTitle('fa-triangle-exclamation', 'Estados excepcionales', 'No forman parte de las etapas obligatorias.')}<div class="proto-badge-row">${exceptional.map(badge).join('')}</div>${incidents.length ? `<p class="proto-alert-text">${incidents.length} incidencia(s) registrada(s) solo en esta demostración.</p>` : ''}<div class="proto-actions">${actionButton('Registrar incidencia', 'incident', '', 'btn-secondary')}${stageAction}</div></article></aside></div>
      <article class="card proto-pad proto-custody">${sectionTitle('fa-people-arrows-left-right', 'Cadena de custodia', 'Responsables y transferencias representados sin firma digital.')}<div class="proto-custody-grid">${custody.map((step, index) => `<div class="proto-custody-item ${step.activeAt.includes(trackingIndex) ? 'current' : ''}"><span class="proto-custody-icon"><i class="fa-solid ${step.icon}"></i></span><div><h3>${step.title}</h3>${info('Responsable', step.responsible)}${info('Organización / función', step.role)}${info('Fecha y hora', step.at)}${info('Observación', step.observation)}${badge(trackingIndex > (step.activeAt.at(-1) ?? index) ? 'Transferida' : step.activeAt.includes(trackingIndex) ? 'Responsable actual' : 'Pendiente')}</div></div>`).join('')}</div></article>
      <article class="card proto-pad">${sectionTitle('fa-clipboard-list', 'Observaciones por proceso')}<div class="proto-info-grid">${info('Observaciones del alimento', donation.foodNotes)}${info('Conservación', donation.conservationNotes)}${info('Envase', donation.packageNotes)}${info('Indicaciones de recojo', donation.pickupNotes)}${info('Entrega', trackingIndex >= 7 ? deliveryNotes || 'Entrega simulada; sin firma digital.' : 'Pendiente de registro')}${info('Recepción', trackingIndex >= 8 ? receptionNotes || 'Confirmación simulada por la organización.' : 'Pendiente de confirmación')}</div></article>`);
  }

  function incidentModal() {
    modal('Registrar incidencia', `<form class="proto-modal-form"><div class="form-grid"><div class="form-group full"><label for="incident-type">Tipo de incidencia</label><select class="form-control" id="incident-type" required><option value="">Seleccionar</option>${['Retraso en recojo', 'Problema con transporte', 'Problema con envase', 'Problema de conservación', 'Organización no se presentó', 'Donación no disponible', 'Otro'].map((item) => `<option>${item}</option>`).join('')}</select></div><div class="form-group full"><label for="incident-description">Descripción / observaciones de incidencia</label><textarea class="form-control" id="incident-description" required placeholder="Describe lo observado"></textarea></div><div class="form-group"><label for="incident-date">Fecha</label><input class="form-control" id="incident-date" type="date" value="${isoDate()}" required></div><div class="form-group"><label for="incident-time">Hora</label><input class="form-control" id="incident-time" type="time" value="${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}" required></div></div></form><p class="proto-disclaimer">Este registro es solo visual y se pierde al recargar.</p>`, [
      { label: 'Cancelar', style: 'btn-secondary' },
      { label: 'Registrar incidencia', style: 'btn-primary', run: () => {
        if (!validModal()) return false;
        incidents.unshift({ type: $('#incident-type').value, description: $('#incident-description').value, date: $('#incident-date').value, time: $('#incident-time').value });
        notificationSets[role].unshift({ category: 'alertas', icon: 'fa-circle-exclamation', title: 'Incidencia registrada', description: $('#incident-type').value, reference: 'DON-103 · incidencia demostrativa', time: nowLabel(), unread: true, target: role === 'administrador' ? 'incidencias' : 'seguimiento' });
        if (role === 'administrador') { renderAdminTracking(); renderAdminIncidents(); renderAdminDashboard(); }
        else renderTracking();
        renderNotifications(currentNotifications);
        toast('Incidencia registrada visualmente. No se guardó en un servidor.');
      } }
    ]);
  }

  function renderDonorDashboard() {
    const pending = donorRequests.filter((request) => ['Pendiente', 'En revisión'].includes(request.status)).length;
    const active = donorDonations.filter((donation) => ['Disponible', 'En proceso'].includes(donation.status)).length;
    mount('dashboard', `${head('Buenos días, Panadería San Carlos', 'Resumen de publicaciones, solicitudes y próximos recojos.', `<button class="btn btn-primary" type="button" data-proto-go="nueva-donacion"><i class="fa-solid fa-plus"></i> Publicar donación</button>`)}
      <div class="stats-grid">${stat('fa-boxes-stacked', active, 'Donaciones activas', 'Disponibles o en proceso')}${stat('fa-inbox', pending, 'Solicitudes pendientes', 'Requieren respuesta', '#c78320')}${stat('fa-truck-ramp-box', trackingIndex >= 7 ? 0 : 1, 'Recojos programados', 'Hoy · 16:30', '#367bc4')}${stat('fa-hand-holding-heart', trackingIndex >= 7 ? 9 : 8, 'Entregas completadas', 'Dato demostrativo', '#14513f')}</div>
      <div class="dashboard-grid"><article class="card proto-pad">${sectionTitle('fa-calendar-check', trackingIndex >= 7 ? 'Última entrega' : 'Próximos recojos')}<div class="proto-feature-row"><div><strong>Leche pasteurizada · 15 litros</strong><p>Comedor Popular Virgen del Carmen · Juan Pérez</p><small>Hoy · 16:30 · Panadería San Carlos</small></div>${badge(trackingIndex >= 7 ? 'Entregada' : 'Recojo programado')}</div><div class="proto-actions"><button class="btn btn-secondary btn-sm" data-proto-go="recojos">Ver coordinación</button></div></article>
      <article class="card proto-pad">${sectionTitle('fa-bell', 'Alertas importantes')}<div class="proto-alert-line"><i class="fa-solid fa-snowflake"></i><span>Leche pasteurizada: cadena de frío declarada.</span></div><div class="proto-alert-line warning"><i class="fa-solid fa-clock"></i><span>Pan integral: revisar hora de recojo y solicitudes.</span></div><div class="proto-actions"><button class="btn btn-secondary btn-sm" data-proto-go="notificaciones">Centro de notificaciones</button></div></article></div>
      <article class="card proto-pad">${sectionTitle('fa-list-check', 'Tareas principales')}<div class="proto-quick-grid"><button class="quick-action" data-proto-go="mis-donaciones"><i class="fa-solid fa-boxes-stacked"></i><span><strong>Mis donaciones</strong><small>Estado de publicación</small></span></button><button class="quick-action" data-proto-go="solicitudes"><i class="fa-solid fa-inbox"></i><span><strong>Evaluar solicitudes</strong><small>Una elección por donación</small></span></button><button class="quick-action" data-proto-go="seguimiento"><i class="fa-solid fa-route"></i><span><strong>Seguimiento</strong><small>Custodia y etapas</small></span></button></div></article>`);
  }

  function renderDonorDonations(filter = 'todas', term = '') {
    const options = ['Todas', 'Disponible', 'En proceso', 'Finalizada', 'Expirada', 'Cancelada'];
    const visible = donorDonations.filter((item) => (filter === 'todas' || item.status.toLowerCase() === filter) && `${item.id} ${item.food} ${item.product}`.toLowerCase().includes(term.toLowerCase()));
    mount('mis-donaciones', `${head('Mis donaciones', 'El estado de la publicación no reemplaza el estado del producto, la solicitud ni la etapa logística.', `<button class="btn btn-primary" data-proto-go="nueva-donacion">Nueva donación</button>`)}
      <div class="proto-filter-row">${options.map((option) => `<button type="button" class="filter-tab ${filter === option.toLowerCase() ? 'active' : ''}" data-proto-filter="donations" data-value="${option.toLowerCase()}">${option}</button>`).join('')}<input class="form-control proto-search" type="search" data-proto-search="donations" value="${escapeHTML(term)}" placeholder="Buscar donación" aria-label="Buscar donación"></div>
      <div class="card table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Alimento</th><th>Cantidad</th><th>Estado del producto</th><th>Conservación</th><th>Fecha límite</th><th>Solicitudes</th><th>Estado de donación</th><th>Etapa</th></tr></thead><tbody>${visible.map((item) => `<tr><td>#${escapeHTML(item.id)}</td><td><strong>${escapeHTML(item.food)}</strong></td><td>${escapeHTML(item.amount)}</td><td>${escapeHTML(item.product)}</td><td>${escapeHTML(item.conservation)}</td><td>${escapeHTML(item.deadline)}</td><td>${item.requests}</td><td>${badge(item.status)}</td><td>${escapeHTML(item.stage)}</td></tr>`).join('') || '<tr><td colspan="9">No hay donaciones para este filtro.</td></tr>'}</tbody></table></div>`);
  }

  function renderNewDonation() {
    mount('nueva-donacion', `${head('Publicar nueva donación', 'Registra datos declarados por el donante. Esta acción no publica una oferta real.')}
      <form class="card form-card" data-proto-form="new-donation">
      <div class="form-section">${sectionTitle('fa-carrot', 'Información general del alimento')}<div class="form-grid">
        <div class="form-group full"><label for="proto-food">Nombre del alimento</label><input class="form-control" id="proto-food" name="food" required placeholder="Ej. Pan integral"></div>
        <div class="form-group"><label for="proto-category">Categoría</label><select class="form-control" id="proto-category" name="category" required><option value="">Seleccionar</option>${['Panadería', 'Frutas', 'Verduras', 'Lácteos', 'Alimentos preparados', 'Abarrotes', 'Bebidas', 'Otros'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label for="proto-quantity">Cantidad</label><input class="form-control" id="proto-quantity" name="quantity" type="number" min="1" required></div>
        <div class="form-group"><label for="proto-unit">Unidad</label><select class="form-control" id="proto-unit" name="unit" required>${['kg', 'litros', 'unidades', 'porciones', 'cajas', 'bolsas'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group full"><label for="proto-food-notes">Observaciones del alimento</label><textarea class="form-control" id="proto-food-notes" name="foodNotes" placeholder="Presentación y características observadas"></textarea></div></div></div>
      <div class="form-section">${sectionTitle('fa-temperature-half', 'Estado y conservación del alimento', 'Información declarada por el donante; no es una certificación sanitaria.')}<div class="form-grid">
        <div class="form-group"><label for="proto-product-status">Estado del producto</label><select class="form-control" id="proto-product-status" name="productStatus" required>${['Apto para recojo', 'Requiere consumo inmediato', 'Próximo a fecha límite', 'Otro'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label for="proto-made">Fecha de elaboración (si corresponde)</label><input class="form-control" id="proto-made" type="date" name="made"></div>
        <div class="form-group"><label for="proto-expires">Fecha de vencimiento (si corresponde)</label><input class="form-control" id="proto-expires" type="date" name="expires"></div>
        <div class="form-group"><label for="proto-deadline">Fecha límite recomendada para recojo</label><input class="form-control" id="proto-deadline" type="date" name="deadline" value="${isoDate()}" required></div>
        <div class="form-group"><label for="proto-conservation">Condición de conservación</label><select class="form-control" id="proto-conservation" name="conservation" required>${['Temperatura ambiente', 'Refrigerado', 'Congelado', 'Mantener caliente', 'Otra'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label for="proto-cold">¿Requiere cadena de frío?</label><select class="form-control" id="proto-cold" name="cold" required><option value="no">No</option><option value="si">Sí</option></select></div>
        <div class="form-group" data-cold-fields hidden><label for="proto-temperature">Temperatura indicada por el donante (°C)</label><input class="form-control" id="proto-temperature" name="temperature" type="number" step="0.1" placeholder="Ej. 4"></div>
        <div class="form-group full"><label for="proto-conservation-notes">Observaciones sobre conservación</label><textarea class="form-control" id="proto-conservation-notes" name="conservationNotes" placeholder="Ej. Mantener refrigerado hasta el recojo."></textarea></div></div></div>
      <div class="form-section">${sectionTitle('fa-box-open', 'Envase y preparación para entrega')}<div class="form-grid">
        <div class="form-group"><label for="proto-package">Tipo de envase</label><select class="form-control" id="proto-package" name="package" required>${['Caja', 'Bolsa', 'Recipiente plástico', 'Recipiente térmico', 'Bandeja', 'Contenedor', 'Envase original', 'Otro'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label for="proto-package-state">Estado del envase</label><select class="form-control" id="proto-package-state" name="packageState" required>${['Cerrado', 'Sellado', 'Empacado', 'Requiere recipiente del beneficiario', 'Otro'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label for="proto-package-count">Cantidad de paquetes o recipientes</label><input class="form-control" id="proto-package-count" name="packageCount" type="number" min="1" required></div>
        <div class="form-group"><label for="proto-provider">¿Quién proporciona el recipiente?</label><select class="form-control" id="proto-provider" name="provider" required>${['Donante', 'Organización beneficiaria', 'No aplica'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group full"><label for="proto-package-pickup">Indicaciones para el recojo del envase</label><textarea class="form-control" id="proto-package-pickup" name="packagePickup" placeholder="Ej. Traer dos contenedores con tapa."></textarea></div>
        <div class="form-group full"><label for="proto-package-notes">Observaciones del embalaje</label><textarea class="form-control" id="proto-package-notes" name="packageNotes"></textarea></div></div></div>
      <div class="form-section">${sectionTitle('fa-truck-ramp-box', 'Información de recojo', 'No se ofrece servicio de entrega real.')}<div class="form-grid">
        <div class="form-group"><label for="proto-pickup-mode">Modalidad</label><select class="form-control" id="proto-pickup-mode" name="pickupMode" required>${['Recojo en el establecimiento', 'Punto de encuentro', 'Entrega coordinada por el donante'].map((v) => `<option>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label for="proto-pickup-date">Fecha disponible</label><input class="form-control" id="proto-pickup-date" name="pickupDate" type="date" value="${isoDate()}" required></div>
        <div class="form-group full"><label for="proto-address">Dirección de recojo</label><input class="form-control" id="proto-address" name="address" value="Jr. Lima 458, Puno" required></div>
        <div class="form-group full"><label for="proto-reference">Referencia</label><input class="form-control" id="proto-reference" name="reference" placeholder="Ej. Entrada lateral"></div>
        <div class="form-group"><label for="proto-from">Hora desde</label><input class="form-control" id="proto-from" name="from" type="time" value="15:00" required></div>
        <div class="form-group"><label for="proto-until">Hora hasta</label><input class="form-control" id="proto-until" name="until" type="time" value="18:00" required></div>
        <div class="form-group"><label for="proto-contact">Persona de contacto</label><input class="form-control" id="proto-contact" name="contact" value="Carlos Quispe" required></div>
        <div class="form-group"><label for="proto-phone">Teléfono de contacto</label><input class="form-control" id="proto-phone" name="phone" type="tel" value="951 234 567" required></div>
        <div class="form-group full"><label for="proto-pickup-notes">Indicaciones de recojo</label><textarea class="form-control" id="proto-pickup-notes" name="pickupNotes" placeholder="Acceso, horario y persona a quien preguntar"></textarea></div></div></div>
      <div class="form-section">${sectionTitle('fa-image', 'Fotografía referencial')}<button class="upload-zone" type="button" data-proto-action="photo-demo"><span><i class="fa-solid fa-cloud-arrow-up"></i><strong>Agregar fotografía</strong>Selección de imagen simulada, sin carga real.</span></button><p class="proto-disclaimer"><i class="fa-solid fa-circle-info"></i> La plataforma solo muestra información declarada por el donante. Los criterios de conservación, transporte, envase e inocuidad están pendientes de validación técnica con especialistas de Nutrición e Ingeniería Agroindustrial.</p><label class="check-row"><input type="checkbox" required><span>Confirmo que los datos ingresados corresponden a mi declaración para esta demostración.</span></label></div>
      <div class="form-actions"><button class="btn btn-secondary" type="button" data-proto-go="mis-donaciones">Cancelar</button><button class="btn btn-primary" type="submit">Publicar en demostración</button></div></form>`);
  }

  function renderDonorRequests() {
    const pending = donorRequests.filter((r) => ['Pendiente', 'En revisión'].includes(r.status)).length;
    mount('solicitudes', `${head('Solicitudes recibidas', 'Una donación disponible puede recibir varias solicitudes. Solo una puede quedar aceptada.', badge(`${pending} por revisar`))}
      <div class="proto-notice"><i class="fa-solid fa-circle-info"></i><span>Ejemplo DON-101: tres organizaciones solicitaron Pan integral. Al aceptar una, las otras se muestran como Rechazadas / no seleccionadas.</span></div>
      <div class="requests-grid">${donorRequests.map((request) => `<article class="request-card"><div class="request-head"><div class="organization-title"><span class="organization-avatar"><i class="fa-solid fa-people-roof"></i></span><div><h3>${escapeHTML(request.organization)}</h3><span>${request.id} · ${request.donation}</span></div></div>${badge(request.status)}</div><div class="request-details"><div class="detail-pair"><small>Donación</small><strong>${escapeHTML(catalog.find((d) => d.id === request.donation)?.food || 'Donación')}</strong></div><div class="detail-pair"><small>Cantidad</small><strong>${escapeHTML(request.amount)}</strong></div><div class="detail-pair"><small>Beneficiarios</small><strong>${request.beneficiaries} personas</strong></div><div class="detail-pair"><small>Recojo propuesto</small><strong>${escapeHTML(request.pickup)}</strong></div></div><div class="request-actions">${actionButton('Ver solicitud', 'donor-request-detail', `data-id="${request.id}"`)}${['Pendiente', 'En revisión'].includes(request.status) ? `${actionButton('Aceptar', 'donor-accept', `data-id="${request.id}"`, 'btn-primary')}${actionButton('Rechazar', 'donor-reject', `data-id="${request.id}"`, 'btn-danger')}` : request.status === 'Aceptada' ? `<button class="btn btn-secondary btn-sm" data-proto-go="recojos">Ver recojo</button>` : ''}</div></article>`).join('')}</div>`);
  }

  function renderDonorPickup() {
    const chosen = donorRequests.find((r) => r.donation === 'DON-101' && r.status === 'Aceptada');
    mount('recojos', `${head('Recojos y entregas', 'Coordinación visual entre donante y representante autorizado; no hay servicio de reparto real.')}
      <div class="proto-two-col"><article class="card proto-pad">${sectionTitle('fa-calendar-check', 'Recojo programado · DON-103')}<div class="proto-info-grid">${info('Alimento', 'Leche pasteurizada · 15 litros')}${info('Organización', 'Comedor Popular Virgen del Carmen')}${info('Hora estimada', 'Hoy · 16:30')}${info('Modalidad', 'Recojo en el establecimiento')}${info('Dirección', 'Jr. Lima 458, Puno')}${info('Referencia', 'Puerta lateral')}${info('Envase', '15 envases originales sellados')}${info('Cadena de frío', 'Requerida según el donante')}</div><div class="proto-actions"><button class="btn btn-primary btn-sm" data-proto-go="seguimiento">Ver seguimiento</button></div></article>
      <article class="card proto-pad">${sectionTitle('fa-id-card', 'Responsable del recojo')}<div class="proto-info-grid">${info('Nombre', 'Juan Pérez')}${info('Organización', 'Comedor Popular Virgen del Carmen')}${info('Teléfono', '+51 952 345 678')}${info('Hora estimada', '16:30')}${info('Transporte adecuado', 'Sí, declarado en la solicitud')}${info('Recipiente', 'Sí, declarado en la solicitud')}</div><p class="proto-disclaimer">La identidad y condiciones se muestran como ejemplo; no hay verificación real ni firma digital.</p></article></div>
      ${chosen ? `<article class="card proto-pad">${sectionTitle('fa-bread-slice', 'Otro recojo seleccionado · DON-101')}<div class="proto-info-grid">${info('Organización seleccionada', chosen.organization)}${info('Responsable del recojo', chosen.person)}${info('Teléfono', chosen.phone)}${info('Hora propuesta', chosen.pickup)}</div></article>` : ''}`);
  }

  function donorRequestDetail(id) {
    const request = donorRequests.find((item) => item.id === id);
    if (!request) return;
    modal(`Solicitud ${request.id}`, `<div class="proto-info-grid">${info('Organización', request.organization)}${info('Donación', request.donation)}${info('Cantidad solicitada', request.amount)}${info('Beneficiarios aproximados', `${request.beneficiaries} personas`)}${info('Responsable del recojo', request.person)}${info('Teléfono', request.phone)}${info('Fecha y hora propuesta', request.pickup)}${info('Transporte adecuado', request.transport)}${info('Recipiente apropiado', request.container)}${info('Estado de la solicitud', request.status)}</div><p class="modal-message"><strong>Observaciones de la solicitud:</strong> ${escapeHTML(request.message)}</p>`, [{ label: 'Cerrar', style: 'btn-secondary' }]);
  }
  function acceptDonorRequest(id) {
    const request = donorRequests.find((item) => item.id === id);
    if (!request || !['Pendiente', 'En revisión'].includes(request.status)) return;
    modal(`Aceptar ${id}`, `<p>¿Seleccionar a <strong>${escapeHTML(request.organization)}</strong> para la donación <strong>${request.donation}</strong>?</p><div class="proto-notice"><i class="fa-solid fa-circle-info"></i><span>Esta solicitud pasará a Aceptada. Las otras solicitudes de la misma donación pasarán a Rechazadas / no seleccionadas. La donación quedará En proceso.</span></div>`, [
      { label: 'Volver', style: 'btn-secondary' },
      { label: 'Aceptar solicitud', style: 'btn-primary', run: () => {
        donorRequests.filter((item) => item.donation === request.donation).forEach((item) => { if (['Pendiente', 'En revisión'].includes(item.status)) item.status = item.id === id ? 'Aceptada' : 'Rechazada'; });
        const donation = donorDonations.find((item) => item.id === request.donation);
        if (donation) { donation.status = 'En proceso'; donation.stage = 'Solicitud aceptada'; }
        notificationSets.donante.unshift({ category: 'solicitudes', icon: 'fa-circle-check', title: 'Solicitud aceptada', description: `${request.organization} fue seleccionada. Las otras solicitudes de la misma donación no fueron seleccionadas.`, reference: `${request.id} · ${request.donation}`, time: nowLabel(), unread: true, target: 'solicitudes' });
        renderDonorRequests(); renderDonorDonations(); renderDonorPickup(); renderDonorDashboard();
        renderNotifications(currentNotifications);
        toast(`${id} aceptada; las demás solicitudes de ${request.donation} no fueron seleccionadas.`);
      } }
    ]);
  }
  function rejectDonorRequest(id) {
    const request = donorRequests.find((item) => item.id === id);
    if (!request || !['Pendiente', 'En revisión'].includes(request.status)) return;
    modal(`Rechazar ${id}`, `<form class="proto-modal-form"><div class="form-group"><label for="proto-reject-reason">Motivo / observaciones de la decisión</label><textarea class="form-control" id="proto-reject-reason" required placeholder="Explique brevemente la decisión"></textarea></div></form>`, [
      { label: 'Volver', style: 'btn-secondary' },
      { label: 'Rechazar solicitud', style: 'btn-danger', run: () => {
        if (!validModal()) return false;
        request.status = 'Rechazada';
        renderDonorRequests(); renderDonorDashboard();
        toast(`La solicitud ${id} se marcó como Rechazada en esta demostración.`);
      } }
    ]);
  }

  function card(donation, small = false) {
    return `<article class="donation-card" data-proto-card="${donation.id}" data-category="${donation.key}" data-location="${donation.location.toLowerCase()}"><div class="donation-image" style="--card-gradient:${donation.gradient}"><i class="fa-solid ${donation.icon}"></i><span class="badge badge-disponible">Disponible</span></div><div class="donation-content"><span class="donation-category">${donation.category}</span><h3>${donation.food}</h3><p class="donation-donor">${donation.donor}</p><div class="proto-badge-row">${badge('Disponible')}${badge(donation.cold ? '❄ Refrigerado' : donation.condition === 'Temperatura ambiente' ? 'Ambiente' : donation.condition)}${donation.cold ? badge('Cadena de frío') : ''}</div><div class="donation-meta"><span><i class="fa-solid fa-box"></i> ${donation.amount} ${donation.unit}</span><span><i class="fa-solid fa-location-dot"></i> ${donation.location}</span><span><i class="fa-regular fa-clock"></i> Disponible hasta: ${donation.deadline}</span></div><button class="btn ${small ? 'btn-secondary' : 'btn-primary'}" type="button" data-proto-action="open-detail" data-id="${donation.id}">Ver detalles</button></div></article>`;
  }
  function renderOrgDashboard() {
    const pending = orgRequests.filter((r) => ['Pendiente', 'En revisión'].includes(r.status)).length;
    mount('dashboard', `${head('Bienvenido, Comedor Popular Virgen del Carmen', 'Encuentra donaciones y coordina recojos de manera clara.', `<button class="btn btn-primary" data-proto-go="disponibles">Buscar donaciones</button>`)}
      <div class="stats-grid">${stat('fa-basket-shopping', 18, 'Donaciones disponibles', 'Dato demostrativo')}${stat('fa-file-circle-question', pending, 'Solicitudes pendientes', 'Sin decisión del donante', '#c78320')}${stat('fa-truck-ramp-box', trackingIndex >= 7 ? 0 : 1, 'Recojos programados', 'Hoy · 16:30', '#367bc4')}${stat('fa-hand-holding-heart', trackingIndex >= 8 ? 15 : 14, 'Donaciones recibidas', 'Dato demostrativo', '#14513f')}</div>
      <div class="dashboard-grid"><article class="card proto-pad">${sectionTitle('fa-calendar-check', trackingIndex >= 7 ? 'Último recojo' : 'Próximos recojos')}<div class="proto-feature-row"><div><strong>Leche pasteurizada · 15 litros</strong><p>Panadería San Carlos · Hoy 16:30</p><small>Condición: ❄ mantener refrigerado según el donante</small></div>${badge(trackingIndex >= 7 ? stages[trackingIndex] : 'Recojo programado')}</div><div class="proto-actions"><button class="btn btn-secondary btn-sm" data-proto-go="recojos">Ver datos del recojo</button></div></article><article class="card proto-pad">${sectionTitle('fa-triangle-exclamation', 'Recordatorios')}<div class="proto-alert-line"><i class="fa-solid fa-box-open"></i><span>Revisar el recipiente indicado para la leche.</span></div><div class="proto-alert-line"><i class="fa-solid fa-clipboard-check"></i><span>Confirmar recepción después de la entrega física.</span></div><div class="proto-actions"><button class="btn btn-secondary btn-sm" data-proto-go="notificaciones">Ver alertas</button></div></article></div>
      <article class="card proto-pad">${sectionTitle('fa-basket-shopping', 'Donaciones cerca de ti')}<div class="donation-grid">${catalog.slice(0, 3).map((item) => card(item, true)).join('')}</div></article>`);
  }
  function renderCatalog() {
    mount('disponibles', `${head('Donaciones disponibles', 'Condiciones y fechas declaradas por cada donante. Solicitar no reserva automáticamente una donación.', badge('18 resultados demostrativos'))}
      <div class="filters-panel proto-catalog-filters"><div class="search-box"><i class="fa-solid fa-magnifying-glass"></i><input class="form-control" type="search" data-proto-catalog-search placeholder="Buscar alimento o donante" aria-label="Buscar alimento o donante"></div><select class="form-control" data-proto-catalog-category aria-label="Filtrar categoría"><option value="todas">Todas las categorías</option>${[...new Set(catalog.map((item) => item.key))].map((key) => `<option value="${key}">${catalog.find((item) => item.key === key).category}</option>`).join('')}</select><select class="form-control" data-proto-catalog-location aria-label="Filtrar distrito"><option value="todas">Todos los distritos</option><option value="puno">Puno</option><option value="juliaca">Juliaca</option></select></div>
      <div class="donation-grid" data-proto-catalog-grid>${catalog.map((item) => card(item)).join('')}</div><div class="empty-state" data-proto-empty hidden><i class="fa-solid fa-magnifying-glass"></i><h3>No hay coincidencias</h3><p>Cambia los filtros o la búsqueda.</p></div>`);
  }
  function applyCatalogFilters() {
    const search = ($('[data-proto-catalog-search]')?.value || '').toLocaleLowerCase('es');
    const category = $('[data-proto-catalog-category]')?.value || 'todas';
    const location = $('[data-proto-catalog-location]')?.value || 'todas';
    let visible = 0;
    $$('[data-proto-catalog-grid] .donation-card').forEach((item) => {
      item.hidden = !((!search || item.textContent.toLocaleLowerCase('es').includes(search)) && (category === 'todas' || item.dataset.category === category) && (location === 'todas' || item.dataset.location === location));
      if (!item.hidden) visible += 1;
    });
    $('[data-proto-empty]').hidden = visible > 0;
  }
  let selectedDonation = catalog[0];
  function renderDonationDetail() {
    const d = selectedDonation;
    mount('detalle', `${head(`Detalle de donación · ${d.id}`, 'La información del alimento y de conservación proviene del donante.', badge('Disponible'))}
      <button class="btn btn-secondary btn-sm proto-back" type="button" data-proto-go="disponibles"><i class="fa-solid fa-arrow-left"></i> Volver al catálogo</button>
      <div class="proto-detail-grid"><article class="card proto-pad">${sectionTitle(d.icon, 'Información general')}<div class="proto-info-grid">${info('Alimento', d.food)}${info('Categoría', d.category)}${info('Cantidad', `${d.amount} ${d.unit}`)}${info('Unidad', d.unit)}${info('Descripción / observaciones del alimento', d.foodNotes)}</div></article>
      <article class="card proto-pad">${sectionTitle('fa-temperature-half', 'Estado y conservación')}<div class="proto-badge-row">${badge(d.productStatus)}${d.cold ? badge('❄ Requiere cadena de frío') : badge('Sin cadena de frío declarada')}</div><div class="proto-info-grid">${info('Estado del producto', d.productStatus)}${info('Fecha de elaboración', d.made)}${info('Fecha de vencimiento', d.expires)}${info('Conservación', d.condition)}${info('Temperatura indicada por el donante', d.temperature)}${info('Cadena de frío', d.cold ? 'Requerida' : 'No declarada')} ${info('Observaciones de conservación', d.conservationNotes)}</div></article>
      <article class="card proto-pad">${sectionTitle('fa-box-open', 'Envase y preparación')}<div class="proto-info-grid">${info('Tipo de envase', d.package)}${info('Estado del envase', d.packageState)}${info('Cantidad de recipientes', d.packageCount)}${info('Proporcionado por', d.provider)}${info('Observaciones del embalaje', d.packageNotes)}</div></article>
      <article class="card proto-pad">${sectionTitle('fa-truck-ramp-box', 'Información de recojo')}<div class="proto-info-grid">${info('Modalidad', d.pickup)}${info('Lugar', d.address)}${info('Referencia', d.reference)}${info('Fecha límite', d.deadline)}${info('Horario', d.hours)}${info('Indicaciones de recojo', d.pickupNotes)}</div></article>
      <article class="card proto-pad">${sectionTitle('fa-store', 'Donante')}<div class="proto-info-grid">${info('Establecimiento', d.donor)}${info('Responsable', d.responsible)}${info('Teléfono', d.phone)}${info('Distrito', d.location)}</div></article>
      <article class="card proto-pad">${sectionTitle('fa-list-check', 'Estado de la donación y solicitudes')}<div class="proto-info-grid">${info('Estado de la donación', 'Disponible')}${info('Solicitudes recibidas', `${d.requests} solicitud(es) demostrativas`)}</div><div class="proto-actions">${actionButton('Solicitar donación', 'open-request', '', 'btn-primary')}</div></article></div>
      <div class="proto-notice"><i class="fa-solid fa-circle-info"></i><span>Las condiciones específicas de conservación e inocuidad deberán validarse mediante criterios técnicos definidos con especialistas de Nutrición e Ingeniería Agroindustrial. REAlimenta no certifica alimentos.</span></div>`);
  }
  function openRequestModal() {
    const d = selectedDonation;
    modal(`Solicitar ${d.food}`, `<form class="proto-modal-form"><div class="proto-notice"><i class="fa-solid fa-circle-info"></i><span>${d.id} · ${d.amount} ${d.unit} disponibles · ${d.donor}. Solicitud visual, sin envío real.</span></div><div class="form-grid proto-modal-grid">
      <div class="form-group"><label for="req-amount">Cantidad solicitada (${d.unit})</label><input class="form-control" id="req-amount" type="number" min="1" max="${d.amount}" value="${Math.min(d.amount, 15)}" required></div>
      <div class="form-group"><label for="req-beneficiaries">Beneficiarios aproximados</label><input class="form-control" id="req-beneficiaries" type="number" min="1" value="65" required></div>
      <div class="form-group"><label for="req-person">Responsable del recojo</label><input class="form-control" id="req-person" value="Juan Pérez" required></div>
      <div class="form-group"><label for="req-phone">Teléfono</label><input class="form-control" id="req-phone" type="tel" value="952 345 678" required></div>
      <div class="form-group"><label for="req-date">Fecha propuesta de recojo</label><input class="form-control" id="req-date" type="date" value="${isoDate()}" required></div>
      <div class="form-group"><label for="req-time">Hora aproximada</label><input class="form-control" id="req-time" type="time" value="16:30" required></div>
      <div class="form-group"><label for="req-transport">¿Cuenta con transporte adecuado?</label><select class="form-control" id="req-transport" required><option value="">Seleccionar</option><option>Sí</option><option>No</option></select></div>
      <div class="form-group"><label for="req-container">¿Cuenta con recipiente apropiado?</label><select class="form-control" id="req-container" required><option value="">Seleccionar</option><option>Sí</option><option>No</option><option>No aplica</option></select></div>
      <div class="form-group full"><label for="req-message">Mensaje / observaciones de la solicitud</label><textarea class="form-control" id="req-message" placeholder="Indique cómo coordinará el recojo"></textarea></div></div></form>`, [
      { label: 'Cancelar', style: 'btn-secondary' },
      { label: 'Enviar solicitud', style: 'btn-primary', run: () => {
        if (!validModal()) return false;
        const id = `SOL-${210 + orgRequests.length}`;
        orgRequests.unshift({ id, food: d.food, donor: d.donor, amount: `${$('#req-amount').value} ${d.unit}`, status: 'Pendiente', logistics: 'Sin recojo asignado', notes: $('#req-message').value });
        notificationSets.organizacion.unshift({ category: 'solicitudes', icon: 'fa-paper-plane', title: 'Solicitud creada en demostración', description: `Solicitud de ${d.food} pendiente de revisión del donante.`, reference: `${id} · ${d.id}`, time: nowLabel(), unread: true, target: 'solicitudes' });
        renderOrgRequests(); renderOrgDashboard(); go('solicitudes');
        renderNotifications(currentNotifications);
        toast(`Solicitud ${id} agregada a esta demostración. No se envió al donante.`);
      } }
    ]);
  }
  function renderOrgRequests(filter = 'todas') {
    const values = ['Todas', 'Pendiente', 'En revisión', 'Aceptada', 'Rechazada', 'Cancelada'];
    const shown = orgRequests.filter((r) => filter === 'todas' || r.status.toLowerCase() === filter);
    mount('solicitudes', `${head('Mis solicitudes', 'Cada solicitud tiene estado propio. La etapa de entrega se muestra en una columna distinta.', `<button class="btn btn-primary" data-proto-go="disponibles">Nueva solicitud</button>`)}
      <div class="proto-filter-row">${values.map((value) => `<button class="filter-tab ${filter === value.toLowerCase() ? 'active' : ''}" type="button" data-proto-filter="org-requests" data-value="${value.toLowerCase()}">${value}</button>`).join('')}</div>
      <div class="card table-wrap"><table class="data-table"><thead><tr><th>Solicitud</th><th>Donación</th><th>Donante</th><th>Cantidad</th><th>Estado de solicitud</th><th>Etapa logística</th><th>Acción</th></tr></thead><tbody>${shown.map((r) => `<tr><td><strong>${r.id}</strong></td><td>${escapeHTML(r.food)}</td><td>${escapeHTML(r.donor)}</td><td>${escapeHTML(r.amount)}</td><td>${badge(r.status)}</td><td>${escapeHTML(r.logistics)}</td><td>${['Pendiente', 'En revisión'].includes(r.status) ? actionButton('Cancelar', 'org-cancel-request', `data-id="${r.id}"`, 'btn-danger') : r.status === 'Aceptada' ? `<button class="btn btn-secondary btn-sm" data-proto-go="seguimiento">Seguimiento</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="7">No hay solicitudes en este estado.</td></tr>'}</tbody></table></div>`);
  }
  function renderOrgPickup() {
    const d = catalog.find((item) => item.id === 'DON-103');
    mount('recojos', `${head('Recojos', 'Información para el representante autorizado de la organización.')}
      <div class="proto-two-col"><article class="card proto-pad">${sectionTitle('fa-truck-ramp-box', 'Recojo programado · DON-103')}<div class="proto-info-grid">${info('Alimento', `${d.food} · ${d.amount} ${d.unit}`)}${info('Donante', d.donor)}${info('Modalidad', d.pickup)}${info('Lugar', d.address)}${info('Referencia', d.reference)}${info('Horario disponible', d.hours)}${info('Hora propuesta', '16:30')}${info('Contacto del donante', `${d.responsible} · ${d.phone}`)}${info('Indicaciones', d.pickupNotes)}</div></article><article class="card proto-pad">${sectionTitle('fa-id-card', 'Responsable del recojo')}<div class="proto-info-grid">${info('Nombre', 'Juan Pérez')}${info('Organización', 'Comedor Popular Virgen del Carmen')}${info('Teléfono', '+51 952 345 678')}${info('Hora estimada', '16:30')}${info('Transporte', 'Adecuado, según la solicitud')}${info('Recipiente', 'Disponible, según la solicitud')}</div><div class="proto-badge-row">${badge('❄ Refrigerado')}${badge('Cadena de frío')}</div><p class="proto-disclaimer">No se monitorea temperatura ni se certifica el transporte. Revise las condiciones declaradas por el donante.</p></article></div>
      <article class="card proto-pad">${sectionTitle('fa-clipboard-check', 'Entrega y recepción')}<p>El representante recoge la donación, la traslada y registra la recepción física. La confirmación corresponde a la organización, no al estado de la solicitud.</p><div class="proto-actions"><button class="btn btn-secondary btn-sm" data-proto-go="seguimiento">Ver cadena de custodia</button>${trackingIndex === 7 ? actionButton('Confirmar recepción', 'confirm-reception', '', 'btn-primary') : trackingIndex === 8 ? actionButton('Finalizar proceso', 'finish-track', '', 'btn-primary') : ''}</div></article>`);
  }
  function recordDeliveryModal() {
    if (trackingIndex !== 6) return;
    modal('Registrar entrega', `<form class="proto-modal-form"><div class="proto-info-grid">${info('Donación', 'DON-103 · Leche pasteurizada')}${info('Etapa actual', 'En traslado')}${info('Responsable del recojo', 'Juan Pérez')}${info('Organización receptora', 'Comedor Popular Virgen del Carmen')}</div><div class="form-group" style="margin-top:16px"><label for="delivery-notes-proto">Observaciones de entrega</label><textarea class="form-control" id="delivery-notes-proto" placeholder="Cantidad entregada, envase, hora y cualquier diferencia observada"></textarea></div><label class="check-row"><input type="checkbox" required><span>Confirmo la entrega física únicamente en esta demostración.</span></label></form>`, [
      { label: 'Volver', style: 'btn-secondary' },
      { label: 'Registrar entrega', style: 'btn-primary', run: () => {
        if (!validModal()) return false;
        deliveryNotes = $('#delivery-notes-proto').value.trim();
        trackingIndex = 7;
        syncTrackingViews();
        toast('Entrega simulada. Falta la confirmación de recepción por la organización.');
      } }
    ]);
  }
  function confirmReceptionModal() {
    if (trackingIndex < 7) { toast('Primero simule la etapa Entregada en el seguimiento.'); return; }
    modal('Confirmar recepción', `<form class="proto-modal-form"><div class="proto-info-grid">${info('Donación', 'DON-103 · Leche pasteurizada')}${info('Organización', 'Comedor Popular Virgen del Carmen')}${info('Etapa actual', stages[trackingIndex])}</div><div class="form-group" style="margin-top:16px"><label for="reception-notes-proto">Observaciones de recepción</label><textarea class="form-control" id="reception-notes-proto" placeholder="Cantidad, envase y condición observada al recibir"></textarea></div><label class="check-row"><input type="checkbox" required><span>Confirmo visualmente la recepción física de esta demostración.</span></label></form>`, [
      { label: 'Volver', style: 'btn-secondary' },
      { label: 'Confirmar recepción', style: 'btn-primary', run: () => {
        if (!validModal()) return false;
        receptionNotes = $('#reception-notes-proto').value.trim();
        trackingIndex = 8;
        syncTrackingViews();
        toast('Recepción confirmada visualmente. Falta cerrar el proceso como Finalizada.');
      } }
    ]);
  }
  function syncTrackingViews() {
    if (role === 'administrador') { renderAdminTracking(); renderAdminDonations(); renderAdminDashboard(); return; }
    renderTracking();
    if (role === 'donante') {
      const milk = donorDonations.find((item) => item.id === 'DON-103');
      milk.stage = stages[trackingIndex];
      milk.status = trackingIndex === 9 ? 'Finalizada' : 'En proceso';
      renderDonorPickup(); renderDonorDonations(); renderDonorDashboard();
    } else {
      const request = orgRequests.find((item) => item.id === 'SOL-104');
      request.logistics = stages[trackingIndex];
      renderOrgPickup(); renderOrgRequests(currentOrgFilter); renderOrgDashboard();
    }
  }

  function renderAdminDashboard() {
    mount('dashboard', `${head('Panel de administración', 'Indicadores ficticios para revisión académica; no son estadísticas en tiempo real.', `<button class="btn btn-primary" data-proto-go="reportes">Ver reportes</button>`)}
      <div class="stats-grid proto-stats-eight">${stat('fa-users', 186, 'Usuarios registrados', 'Total de ejemplo')}${stat('fa-store', 58, 'Donantes', 'Establecimientos')}${stat('fa-people-roof', 42, 'Organizaciones', 'Beneficiarias')}${stat('fa-boxes-stacked', 71, 'Donaciones activas', 'Disponibles o en proceso')}${stat('fa-inbox', 12, 'Solicitudes activas', 'Pendientes o en revisión', '#c78320')}${stat('fa-truck', 6, 'Recojos de hoy', 'Programados', '#367bc4')}${stat('fa-triangle-exclamation', 2 + incidents.length, 'Incidencias abiertas', 'Requieren revisión', '#c35d45')}${stat('fa-user-check', 8, 'Verificaciones pendientes', 'Donantes y organizaciones', '#8c65a5')}</div>
      <div class="dashboard-grid"><article class="card proto-pad">${sectionTitle('fa-bell', 'Alertas del sistema')}<div class="proto-alert-line warning"><i class="fa-solid fa-clock"></i><span>3 donaciones próximas a expirar.</span></div><div class="proto-alert-line warning"><i class="fa-solid fa-triangle-exclamation"></i><span>2 incidencias abiertas.</span></div><div class="proto-alert-line"><i class="fa-solid fa-user-clock"></i><span>4 organizaciones pendientes de verificación.</span></div><div class="proto-actions"><button class="btn btn-secondary btn-sm" data-proto-go="notificaciones">Ver notificaciones</button></div></article>
      <article class="card proto-pad">${sectionTitle('fa-route', 'Operación en seguimiento')}<div class="proto-feature-row"><div><strong>DON-103 · Leche pasteurizada</strong><p>Etapa: ${stages[trackingIndex]}</p><small>Solicitud SOL-104 aceptada · recojo hoy 16:30</small></div>${badge('En proceso')}</div><div class="proto-actions"><button class="btn btn-secondary btn-sm" data-proto-go="seguimientos">Abrir seguimiento</button><button class="btn btn-secondary btn-sm" data-proto-go="incidencias">Ver incidencias</button></div></article></div>`);
  }
  function renderAdminDonations() {
    const rows = [
      ['DON-101', 'Pan integral', 'Panadería San Carlos', '30 unidades', 'Apto para recojo', 'Disponible', 'Solicitud recibida'],
      ['DON-102', 'Frutas variadas', 'Mercado Central Puno', '20 kg', 'Próximo a fecha límite', 'Disponible', 'Solicitud recibida'],
      ['DON-103', 'Leche pasteurizada', 'Panadería San Carlos', '15 litros', 'Apto para recojo', 'En proceso', stages[trackingIndex]],
      ['DON-099', 'Arroz preparado', 'Restaurante Lago Azul', '12 porciones', 'Requiere consumo inmediato', 'Finalizada', 'Finalizada'],
      ['DON-098', 'Pan francés', 'Panadería Delicias del Sur', '20 unidades', 'Próximo a fecha límite', 'Expirada', 'No corresponde']
    ];
    mount('donaciones', `${head('Gestión de donaciones', 'El estado del producto, de la donación y del seguimiento se supervisan por separado.')}
      <div class="card table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Alimento</th><th>Donante</th><th>Cantidad</th><th>Estado del producto</th><th>Estado de donación</th><th>Etapa logística</th><th>Acción</th></tr></thead><tbody>${rows.map((row) => `<tr><td>#${row[0]}</td><td><strong>${row[1]}</strong></td><td>${row[2]}</td><td>${row[3]}</td><td>${escapeHTML(row[4])}</td><td>${badge(row[5])}</td><td>${row[6]}</td><td>${actionButton('Ver', 'admin-donation-detail', `data-id="${row[0]}"`)}</td></tr>`).join('')}</tbody></table></div>`);
  }
  function renderAdminRequests() {
    const rows = [
      ['SOL-101', 'Comedor Virgen del Carmen', 'DON-101 · Pan integral', 'Panadería San Carlos', 'Pendiente'],
      ['SOL-102', 'Olla Común Santa Rosa', 'DON-101 · Pan integral', 'Panadería San Carlos', 'En revisión'],
      ['SOL-104', 'Comedor Virgen del Carmen', 'DON-103 · Leche pasteurizada', 'Panadería San Carlos', 'Aceptada'],
      ['SOL-098', 'Asociación Nuevo Amanecer', 'DON-099 · Arroz preparado', 'Restaurante Lago Azul', 'Rechazada'],
      ['SOL-097', 'Comedor San Martín', 'DON-105 · Galletas de avena', 'Delicias del Sur', 'Cancelada']
    ];
    mount('solicitudes', `${head('Gestión de solicitudes', 'Las solicitudes no tienen los estados Entregada ni Finalizada: esos hitos son logísticos.')}
      <div class="card table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Organización</th><th>Donación</th><th>Donante</th><th>Estado de solicitud</th><th>Acción</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td><td>${badge(row[4])}</td><td>${actionButton('Ver referencia', 'admin-request-detail', `data-id="${row[0]}"`)}</td></tr>`).join('')}</tbody></table></div>`);
  }
  function renderAdminTracking() {
    renderTracking();
    const view = $('[data-view-section="seguimientos"]');
    $('.page-header', view)?.insertAdjacentHTML('afterend', `<article class="card proto-pad proto-admin-tracking-list">${sectionTitle('fa-list', 'Seguimientos supervisados')}<div class="proto-info-grid">${info('DON-103 · Leche pasteurizada', stages[trackingIndex])}${info('DON-099 · Arroz preparado', 'Finalizada')}${info('DON-101 · Pan integral', 'Solicitud recibida')}</div></article>`);
  }
  function renderAdminIncidents() {
    const listed = [
      { type: 'Retraso en recojo', description: 'Representante aún no llega al punto de recojo.', date: displayDate(), time: '15:30', status: 'Abierta', reference: 'INC-021 · DON-102' },
      { type: 'Problema con envase', description: 'La organización reportó falta de recipiente al momento del recojo.', date: displayDate(), time: '12:10', status: 'Abierta', reference: 'INC-022 · DON-104' },
      ...incidents.map((item, index) => ({ ...item, status: 'Abierta', reference: `INC-DEMO-${index + 1} · DON-103` }))
    ];
    mount('incidencias', `${head('Incidencias', 'Eventos excepcionales separados del flujo normal de seguimiento.', actionButton('Registrar incidencia', 'incident', '', 'btn-primary'))}
      <div class="card table-wrap"><table class="data-table"><thead><tr><th>Referencia</th><th>Tipo</th><th>Observaciones de incidencia</th><th>Fecha</th><th>Hora</th><th>Estado</th></tr></thead><tbody>${listed.map((item) => `<tr><td>${escapeHTML(item.reference)}</td><td>${escapeHTML(item.type)}</td><td>${escapeHTML(item.description)}</td><td>${escapeHTML(item.date)}</td><td>${escapeHTML(item.time)}</td><td>${badge(item.status)}</td></tr>`).join('')}</tbody></table></div><div class="proto-notice"><i class="fa-solid fa-circle-info"></i><span>Una incidencia puede afectar un recojo, pero no es una etapa obligatoria. Los registros nuevos no persisten al recargar.</span></div>`);
  }
  function renderAdminReports() {
    mount('reportes', `${head('Reportes e impacto', 'Cifras ilustrativas para mostrar cómo podrían separarse indicadores en una futura implementación.')}
      <div class="proto-two-col"><article class="card proto-pad">${sectionTitle('fa-chart-column', 'Donaciones por categoría')}<div class="proto-report-list"><div><span>Panadería</span><strong>34 %</strong></div><div><span>Frutas y verduras</span><strong>26 %</strong></div><div><span>Alimentos preparados</span><strong>22 %</strong></div><div><span>Lácteos</span><strong>12 %</strong></div><div><span>Otros</span><strong>6 %</strong></div></div></article><article class="card proto-pad">${sectionTitle('fa-list-check', 'Estado general de donaciones')}<div class="proto-report-list"><div><span>Finalizadas</span><strong>68 %</strong></div><div><span>Disponibles</span><strong>20 %</strong></div><div><span>En proceso</span><strong>9 %</strong></div><div><span>Expiradas / canceladas</span><strong>3 %</strong></div></div><p class="proto-disclaimer">La etapa Entregada no se suma como un estado independiente de solicitud. Son dimensiones diferentes.</p></article></div>
      <article class="card proto-pad">${sectionTitle('fa-diagram-project', 'Indicadores por dimensión')}<div class="proto-info-grid">${info('Estado del producto', 'Declarado por el donante')}${info('Estado de la donación', 'Disponibilidad y cierre')}${info('Estado de la solicitud', 'Decisión por organización')}${info('Etapa logística', 'Secuencia de recojo a recepción')}</div></article>`);
  }

  if (role === 'donante') {
    addNav('solicitudes', 'recojos', 'Recojos y entregas', 'fa-truck-ramp-box');
    addView('recojos', 'Recojos y entregas', '', 'seguimiento');
    renderDonorDashboard(); renderDonorDonations(); renderNewDonation(); renderDonorRequests(); renderDonorPickup(); renderTracking(); renderNotifications();
  } else if (role === 'organizacion') {
    addNav('solicitudes', 'recojos', 'Recojos', 'fa-truck-ramp-box');
    addView('recojos', 'Recojos', '', 'seguimiento');
    renderOrgDashboard(); renderCatalog(); renderDonationDetail(); renderOrgRequests(); renderOrgPickup(); renderTracking(); renderNotifications();
  } else {
    const oldNav = $('.sidebar-nav [data-view="entregas"]');
    if (oldNav) { oldNav.dataset.view = 'seguimientos'; oldNav.innerHTML = '<i class="fa-solid fa-route"></i> Seguimientos'; }
    const oldView = $('[data-view-section="entregas"]');
    if (oldView) { oldView.dataset.viewSection = 'seguimientos'; oldView.dataset.title = 'Seguimientos'; }
    addNav('seguimientos', 'incidencias', 'Incidencias', 'fa-triangle-exclamation');
    addView('incidencias', 'Incidencias', '', 'verificaciones');
    renderAdminDashboard(); renderAdminDonations(); renderAdminRequests(); renderAdminTracking(); renderAdminIncidents(); renderAdminReports(); renderNotifications();
  }

  let currentNotifications = 'todas';
  let currentDonorFilter = 'todas';
  let currentOrgFilter = 'todas';
  document.addEventListener('click', (event) => {
    const navigation = event.target.closest('[data-proto-go]');
    if (navigation) { go(navigation.dataset.protoGo); return; }
    const filter = event.target.closest('[data-proto-filter]');
    if (filter) {
      if (filter.dataset.protoFilter === 'notification') { currentNotifications = filter.dataset.value; renderNotifications(currentNotifications); }
      if (filter.dataset.protoFilter === 'donations') { currentDonorFilter = filter.dataset.value; renderDonorDonations(currentDonorFilter, $('[data-proto-search="donations"]')?.value || ''); }
      if (filter.dataset.protoFilter === 'org-requests') { currentOrgFilter = filter.dataset.value; renderOrgRequests(currentOrgFilter); }
      return;
    }
    const control = event.target.closest('[data-proto-action]');
    if (!control) return;
    const id = control.dataset.id;
    switch (control.dataset.protoAction) {
      case 'read-all': notificationSets[role].forEach((item) => { item.unread = false; }); renderNotifications(currentNotifications); toast('Notificaciones marcadas como leídas en esta vista.'); break;
      case 'read-notification': notificationSets[role][Number(control.dataset.index)].unread = false; renderNotifications(currentNotifications); break;
      case 'notification-go': go(control.dataset.target); break;
      case 'incident': incidentModal(); break;
      case 'photo-demo': toast('La fotografía se representa visualmente; no se cargó ningún archivo.'); break;
      case 'advance-track':
        if (trackingIndex < 6) { trackingIndex += 1; syncTrackingViews(); toast(`Etapa ${stages[trackingIndex]} simulada.`); }
        break;
      case 'record-delivery': recordDeliveryModal(); break;
      case 'confirm-reception': confirmReceptionModal(); break;
      case 'finish-track': trackingIndex = 9; syncTrackingViews(); toast('Proceso marcado como Finalizada en esta demostración.'); break;
      case 'donor-request-detail': donorRequestDetail(id); break;
      case 'donor-accept': acceptDonorRequest(id); break;
      case 'donor-reject': rejectDonorRequest(id); break;
      case 'open-detail': selectedDonation = catalog.find((item) => item.id === id) || catalog[0]; renderDonationDetail(); go('detalle'); break;
      case 'open-request': openRequestModal(); break;
      case 'org-cancel-request': {
        const request = orgRequests.find((item) => item.id === id);
        if (!request) break;
        modal(`Cancelar ${id}`, `<p>¿Cancelar la solicitud de <strong>${escapeHTML(request.food)}</strong>?</p><p class="proto-disclaimer">La cancelación solo cambia la vista actual.</p>`, [{ label: 'Volver', style: 'btn-secondary' }, { label: 'Cancelar solicitud', style: 'btn-danger', run: () => { request.status = 'Cancelada'; request.logistics = 'No corresponde'; renderOrgRequests(currentOrgFilter); renderOrgDashboard(); toast(`${id} cancelada visualmente.`); } }]);
        break;
      }
      case 'admin-donation-detail': {
        const donation = catalog.find((item) => item.id === id);
        modal(`Donación ${id}`, donation ? `<div class="proto-info-grid">${info('Alimento', donation.food)}${info('Cantidad', `${donation.amount} ${donation.unit}`)}${info('Donante', donation.donor)}${info('Estado del producto', donation.productStatus)}${info('Conservación', donation.condition)}${info('Cadena de frío', donation.cold ? 'Requerida' : 'No declarada')}${info('Envase', donation.package)}${info('Recojo', `${donation.address} · ${donation.hours}`)}</div><p class="proto-disclaimer">Condiciones declaradas por el donante, sin certificación de REAlimenta.</p>` : `<p>Registro histórico ${id}. Consulte el listado para su estado general.</p>`);
        break;
      }
      case 'admin-request-detail': modal(`Solicitud ${id}`, `<p>Referencia ${id}. El estado de esta solicitud aparece en la tabla; la entrega se consulta por separado en Seguimientos.</p>`); break;
      default: break;
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-proto-catalog-search]')) applyCatalogFilters();
    if (event.target.matches('[data-proto-search="donations"]')) {
      const term = event.target.value;
      const start = event.target.selectionStart;
      renderDonorDonations(currentDonorFilter, term);
      const replacement = $('[data-proto-search="donations"]');
      replacement.focus(); replacement.setSelectionRange(start, start);
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-proto-catalog-category], [data-proto-catalog-location]')) applyCatalogFilters();
    if (event.target.id === 'proto-cold') {
      const fields = $('[data-cold-fields]');
      const temperature = $('#proto-temperature');
      const active = event.target.value === 'si';
      fields.hidden = !active;
      temperature.required = active;
      if (!active) temperature.value = '';
    }
  });
  document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-proto-form="new-donation"]')) return;
    event.preventDefault();
    const form = event.target;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const values = new FormData(form);
    if (values.get('from') >= values.get('until')) { toast('La hora hasta debe ser posterior a la hora desde.'); return; }
    const id = `DON-DEMO-${donorDonations.length + 1}`;
    donorDonations.unshift({ id, food: values.get('food'), amount: `${values.get('quantity')} ${values.get('unit')}`, product: values.get('productStatus'), conservation: `${values.get('cold') === 'si' ? '❄ ' : ''}${values.get('conservation')}`, deadline: `${values.get('deadline')} · ${values.get('until')}`, requests: 0, status: 'Disponible', stage: 'Publicada' });
    renderDonorDonations(); renderDonorDashboard();
    go('mis-donaciones');
    toast(`${id} agregada solo a esta sesión de demostración.`);
  });

  const initialHash = location.hash.slice(1);
  if (initialHash && $(`[data-view-section="${initialHash}"]`)) go(initialHash);
});
