/* Seguimiento registrado en MySQL. Los pasos son manuales y la ruta no usa GPS en vivo. */
(() => {
  let ctx, records = [], selected = null, currentView = 'seguimiento', filter = 'todos', loadSequence = 0;
  const $ = s => ctx.main.querySelector(s);
  const names = { preparacion: 'Recojo acordado', listo: 'Listo para recoger', recogido: 'Recogido', confirmado: 'Recibido', con_problemas: 'Recibido con problemas' };
  const stepNames = { aceptacion: 'Se aceptó la solicitud', listo: 'El alimento está listo', recogido: 'Se recogió el alimento', en_transito: 'Salió hacia la beneficiaria', entregado: 'Llegó a la beneficiaria', confirmado: 'La beneficiaria lo recibió', con_problemas: 'Recibido con problemas', observacion: 'Nota agregada' };
  const conditionNames = { sin_verificar: 'No se revisó', sin_novedad: 'En buen estado', requiere_revision: 'Hay algo que revisar', no_conforme: 'En mal estado' };
  const steps = [['preparacion', 'Aceptada'], ['listo', 'Listo'], ['recogido', 'Recogido'], ['confirmado', 'Recibido']];
  const closed = t => ['confirmado', 'con_problemas'].includes(t.estado);
  const e = v => ctx.escape(v), n = v => ctx.number(v), dt = v => ctx.date(v);
  const button = (text, action, id = '', cls = 'btn-secondary') => `<button type="button" class="btn ${cls}" data-custody-action="${action}" ${id !== '' ? `data-id="${e(id)}"` : ''}>${text}</button>`;
  const badge = (status, cls = '') => `<span class="custody-badge ${cls || status}"><span></span>${e(names[status] || status)}</span>`;

  // Teléfono para coordinar: llamada y WhatsApp (celular peruano de 9 dígitos que empieza con 9).
  function contactLinks(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '<span class="small-muted">Sin teléfono registrado</span>';
    const mobile = /^9\d{8}$/.test(digits);
    return `<a class="btn btn-secondary contact-link" href="tel:${mobile ? `+51${digits}` : digits}"><i class="fa-solid fa-phone"></i> ${e(digits)}</a>${mobile ? `<a class="btn btn-primary contact-link" href="https://wa.me/51${digits}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ''}`;
  }
  function contactCard(kicker, name, person, phone, note = '') {
    return `<article class="mvp-panel contact-card"><span class="section-kicker">${kicker}</span><h3>${e(name)}</h3>${person ? `<p><i class="fa-solid fa-user"></i> ${e(person)}</p>` : ''}<div class="contact-actions">${contactLinks(phone)}</div>${note ? `<p class="small-muted">${note}</p>` : ''}</article>`;
  }
  window.REAContact = { links: contactLinks, card: contactCard };

  async function render(view = 'seguimiento') {
    currentView = view;
    const response = await REA.request('/api/seguimiento'); records = response.data;
    if (view === 'incidencias') { await renderIncidents(); return; }
    const open = records.filter(t => !closed(t) && t.donacion_estado !== 'cancelada');
    ctx.setContent(`${ctx.heading('Recojos y entregas', 'Coordina el recojo con la otra parte y registra cada paso: listo, recogido y recibido.', button('<i class="fa-solid fa-rotate"></i> Actualizar', 'refresh'))}
      <div class="custody-overview"><article><span class="custody-overview-icon"><i class="fa-solid fa-truck-fast"></i></span><div><strong>${open.length}</strong><span>recojos en curso</span></div></article><article><span class="custody-overview-icon amber"><i class="fa-solid fa-shield-heart"></i></span><div><strong>${records.reduce((sum, t) => sum + Number(t.incidencias_abiertas), 0)}</strong><span>incidencias por revisar</span></div></article><article><span class="custody-overview-icon"><i class="fa-solid fa-circle-check"></i></span><div><strong>${records.filter(closed).length}</strong><span>entregas recibidas</span></div></article></div>
      <div class="custody-layout"><aside class="custody-selector mvp-panel"><div class="custody-selector-head"><span class="section-kicker">TUS RECOJOS</span><h2>Elige uno</h2></div><label class="custody-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-custody-search aria-label="Buscar recojo" placeholder="Alimento o entidad"></label><div data-custody-list></div></aside><div class="custody-detail" data-custody-detail><div class="app-loading"><span class="loading-spinner"></span><p>Cargando el recojo…</p></div></div></div>`, 'Recojos y entregas');
    renderList();
    const selectedId = records.find(t => t.id_seguimiento === selected?.id_seguimiento)?.id_seguimiento || open[0]?.id_seguimiento || records[0]?.id_seguimiento;
    if (selectedId) await select(selectedId);
    else $('[data-custody-detail]').innerHTML = '<div class="mvp-panel mvp-empty"><span class="empty-icon"><i class="fa-solid fa-route"></i></span><h2>Aún no hay recojos.</h2><p>Cuando el donante acepte una solicitud, el recojo aparecerá aquí con el contacto de la otra parte.</p></div>';
  }
  function renderList(q = '') {
    const container = $('[data-custody-list]'); if (!container) return;
    const visible = records.filter(t => `${t.alimento} ${t.origen.nombre} ${t.destino.nombre}`.toLocaleLowerCase('es').includes(q.toLocaleLowerCase('es')));
    container.innerHTML = visible.map(t => `<button type="button" class="custody-choice ${t.id_seguimiento === selected?.id_seguimiento ? 'selected' : ''}" data-custody-action="select" data-id="${t.id_seguimiento}" aria-pressed="${t.id_seguimiento === selected?.id_seguimiento}"><img src="${REAPresentation.photo(t)}" alt="" loading="lazy"><span class="custody-choice-copy"><small>RECOJO #${t.id_seguimiento}</small><strong>${e(t.alimento)}</strong><span>${e(ctx.role === 'organizacion' ? t.origen.nombre : t.destino.nombre)}</span><em><span class="custody-status-dot ${closed(t) ? 'verde' : t.incidencias_abiertas ? 'amarillo' : 'gris'}"></span>${e(t.donacion_estado === 'cancelada' ? 'Cancelado' : names[t.estado])}${t.incidencias_abiertas > 0 ? ` · ${t.incidencias_abiertas} incidencia(s)` : ''}</em></span></button>`).join('') || '<p class="small-muted">No hay recojos que coincidan.</p>';
  }
  async function select(id) {
    const seq = ++loadSequence;
    const response = await REA.request(`/api/seguimiento/${id}`);
    if (seq !== loadSequence || currentView !== 'seguimiento' || !$('[data-custody-detail]')) return;
    selected = response.data;
    const index = records.findIndex(t => t.id_seguimiento === selected.id_seguimiento); if (index >= 0) records[index] = selected;
    renderList($('[data-custody-search]')?.value || ''); renderSelected();
  }
  // Botones según quién mira y en qué paso está el recojo.
  function actions(t) {
    if (t.donacion_estado === 'cancelada' || t.solicitud_estado !== 'aceptada') return '<p class="small-muted">Este recojo se canceló.</p>';
    if (closed(t)) return `<p class="small-muted"><i class="fa-solid fa-circle-check"></i> ${t.estado === 'con_problemas' ? 'La beneficiaria registró problemas al recibirlo. Administración revisará la incidencia.' : 'Entrega terminada. ¡Gracias!'}</p>`;
    const role = ctx.role, before = ['preparacion', 'listo'].includes(t.estado), list = [];
    if (t.estado === 'preparacion' && ['donante', 'administrador'].includes(role)) list.push(button('<i class="fa-solid fa-box"></i> Marcar como listo', 'step', 'listo', 'btn-primary'));
    if (t.estado === 'listo' && role !== 'administrador') list.push(button(`<i class="fa-solid fa-handshake"></i> ${role === 'donante' ? 'Ya lo recogieron' : 'Ya lo recogimos'}`, 'step', 'recogido', 'btn-primary'));
    if (t.estado === 'recogido' && ['organizacion', 'administrador'].includes(role)) list.push(button('<i class="fa-solid fa-check-double"></i> Lo recibimos bien', 'step', 'confirmado', 'btn-primary'), button('<i class="fa-solid fa-triangle-exclamation"></i> Lo recibimos con problemas', 'step', 'con_problemas', 'btn-danger-outline'));
    if (before) list.push(button(role === 'donante' ? '<i class="fa-solid fa-user-xmark"></i> No vinieron a recoger' : role === 'organizacion' ? '<i class="fa-solid fa-ban"></i> No podremos recogerlo' : '<i class="fa-solid fa-ban"></i> Anular recojo', 'release', t.id_seguimiento, 'btn-danger-outline'));
    list.push(button('Agregar una nota', 'step', 'observacion'));
    const waiting = t.estado === 'preparacion' && role === 'organizacion' ? '<p class="small-muted">El donante marcará cuando el alimento esté listo. Puedes coordinar con él por teléfono.</p>' : t.estado === 'recogido' && role === 'donante' ? '<p class="small-muted">La beneficiaria confirmará cuando lo reciba.</p>' : '';
    return `${waiting}<div class="custody-event-actions">${list.join('')}</div>`;
  }
  function renderSelected() {
    REAMaps.dispose($('[data-custody-detail]'));
    const t = selected;
    // Los pasos cumplidos llevan check; el siguiente queda resaltado.
    const reached = closed(t) ? 3 : steps.findIndex(([s]) => s === t.estado);
    const canceled = t.donacion_estado === 'cancelada' || t.solicitud_estado !== 'aceptada';
    // Cada parte ve el contacto de la otra; administración ve las dos.
    const donorCard = contactCard('DONANTE', t.origen.nombre, t.origen.responsable, t.origen.telefono, `Recojo en: ${e(t.origen.direccion)}`);
    const orgCard = contactCard('QUIEN RECOGE', t.destino.nombre, t.destino.responsable, t.destino.telefono, t.tiempo_llegada_min ? `Dijo que tardaría unos ${n(t.tiempo_llegada_min)} min en llegar. Hora propuesta: ${dt(t.fecha_propuesta)}.` : `Hora propuesta: ${dt(t.fecha_propuesta)}.`);
    const contacts = ctx.role === 'donante' ? orgCard : ctx.role === 'organizacion' ? donorCard : donorCard + orgCard;
    $('[data-custody-detail]').innerHTML = `<article class="mvp-panel custody-shipment"><div class="custody-shipment-heading"><div><span class="section-kicker">DONACIÓN #${t.id_donacion} · SOLICITUD #${t.id_solicitud}</span><h2>${e(t.alimento)}</h2><p>${n(t.cantidad)} ${e(t.unidad)} · Se puede recoger hasta ${dt(t.fecha_limite_recojo)}</p></div>${badge(canceled ? 'Cancelado' : t.estado, canceled ? 'cancelada' : '')}</div>
      <div class="custody-stepper simple-stepper" aria-label="Pasos del recojo">${steps.map(([s, label], i) => `<div class="${i <= reached ? 'done' : i === reached + 1 ? 'current' : ''}"><span>${i <= reached ? '<i class="fa-solid fa-check"></i>' : i + 1}</span><strong>${label}</strong></div>`).join('')}</div>
      ${actions(t)}
      <div class="contact-grid">${contacts}</div>
      <div data-route-controls></div><div class="map-surface custody-map" id="custody-map" data-route-map></div><p class="field-hint"><strong>A</strong>: lugar de recojo · <strong>B</strong>: beneficiaria.</p></article>
      <div class="custody-below-grid"><article class="mvp-panel custody-condition"><span class="section-kicker">EL ALIMENTO</span><h2>Cómo se conserva</h2><img src="${REAPresentation.photo(t)}" alt="Foto de ${e(t.alimento)}"><dl><div><dt>Cómo debe guardarse</dt><dd>${e(t.conservacion_declarada || 'No indicado')}</dd></div><div><dt>Envase</dt><dd>${e(t.envase || 'No indicado')}</dd></div><div><dt>Se puede consumir hasta</dt><dd>${dt(t.fecha_limite_aprovechamiento_declarada)}</dd></div><div><dt>Lo tiene ahora</dt><dd>${e(t.custodio_actual)}</dd></div></dl>${t.requiere_cadena_frio ? '<p class="mvp-message warning">Debe mantenerse frío durante el viaje.</p>' : ''}<p class="custody-small-note"><i class="fa-solid fa-circle-info"></i> La información es declarada por el donante. REAlimenta no certifica la inocuidad del alimento.</p></article>
      <article class="mvp-panel custody-history"><div class="panel-heading"><div><span class="section-kicker">HISTORIAL</span><h2>Lo que pasó</h2></div><span class="history-total">${t.hitos.length} registro(s)</span></div><ol class="custody-timeline">${t.hitos.map(h => `<li><span class="timeline-node"><i class="fa-solid ${h.tipo === 'recogido' ? 'fa-handshake' : h.tipo === 'confirmado' ? 'fa-check-double' : h.tipo === 'con_problemas' ? 'fa-triangle-exclamation' : h.tipo === 'observacion' ? 'fa-comment' : 'fa-check'}"></i></span><div><small>${dt(h.fecha_evento)}</small><h3>${e(stepNames[h.tipo] || h.tipo)}</h3><p class="timeline-author">${e(h.actor_nombre)}</p>${h.responsable_entrega || h.responsable_recibe ? `<p class="timeline-transfer"><i class="fa-solid fa-arrow-right-arrow-left"></i> ${e(h.responsable_entrega || 'No indicado')} → ${e(h.responsable_recibe || 'No indicado')}</p>` : ''}${h.observacion ? `<p>${e(h.observacion)}</p>` : ''}${h.condicion_declarada !== 'sin_verificar' ? `<span class="timeline-condition ${h.condicion_declarada}">${e(conditionNames[h.condicion_declarada])}${h.temperatura_c != null ? ` · ${n(h.temperatura_c)} °C` : ''}</span>` : ''}</div></li>`).join('')}</ol></article></div>
      <article class="mvp-panel custody-alerts"><div class="panel-heading"><div><span class="section-kicker">PROBLEMAS</span><h2>Incidencias de este recojo</h2></div>${button('<i class="fa-solid fa-triangle-exclamation"></i> Reportar incidencia', 'incident', t.id_seguimiento, 'btn-danger-outline')}</div>${t.incidencias.length ? t.incidencias.map(incidentCard).join('') : '<div class="custody-no-alert"><i class="fa-solid fa-shield-heart"></i><span>No hay incidencias en este recojo.</span></div>'}</article>`;
    REARoute.mount($('[data-custody-detail]'), { id: t.id_seguimiento, tracking: true, origen: t.origen, destino: t.destino, requiresCold: t.requiere_cadena_frio, closed: closed(t) || canceled });
  }
  function stepDialog(type) {
    const t = selected;
    const titles = { listo: 'Marcar como listo', recogido: 'Registrar el recojo', confirmado: 'Confirmar que lo recibieron', con_problemas: 'Recibido con problemas', observacion: 'Agregar una nota' };
    const intro = { listo: 'Avisaremos a la beneficiaria que ya puede pasar a recoger.', recogido: 'Confirma quién entregó y quién se llevó el alimento.', confirmado: 'Confirmas que el alimento llegó a tu entidad. Avisaremos al donante.', con_problemas: 'Cuéntanos qué pasó. Se creará una incidencia para que administración la revise y avisaremos al donante.', observacion: 'La nota queda en el historial con tu nombre y la hora.' }[type];
    const people = type === 'recogido' ? `<label>¿Quién entregó?<input class="form-control" name="responsable_entrega" value="${e(t.origen.responsable || t.origen.nombre)}" maxlength="150"></label><label>¿Quién lo recogió?<input class="form-control" name="responsable_recibe" value="${e(t.responsable_recojo)}" maxlength="150"></label>` : '';
    const condition = ['recogido', 'observacion'].includes(type) ? `<label class="full">¿Cómo está el alimento?<select class="form-control" name="condicion_declarada"><option value="sin_verificar">No lo revisé</option><option value="sin_novedad">Está bien</option><option value="requiere_revision">Hay algo que revisar</option><option value="no_conforme">Está en mal estado (se reportará un problema)</option></select></label>` : '';
    const noteRequired = ['con_problemas', 'observacion'].includes(type);
    ctx.openDialog(titles[type], `<form id="custody-event-form" data-type="${type}" data-id="${t.id_seguimiento}" data-version="${t.version}"><p class="dialog-intro">${intro}</p><div class="form-grid">${people}${condition}<label class="full">${type === 'con_problemas' ? '¿Qué problema hubo?' : 'Nota (opcional)'}<textarea class="form-control" name="observacion" ${noteRequired ? `required minlength="${type === 'con_problemas' ? 10 : 5}"` : ''} maxlength="2500" placeholder="${type === 'con_problemas' ? 'Ej. Faltaban dos bolsas y una caja llegó abierta.' : 'Ej. Se entregaron 3 cajas cerradas.'}"></textarea></label></div><div class="mvp-message error" data-custody-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn ${type === 'con_problemas' ? 'btn-danger' : 'btn-primary'}" type="submit">${titles[type]}</button></div></form>`);
  }
  function releaseDialog() {
    const role = ctx.role;
    const intro = role === 'donante' ? 'Registra que nadie vino a recoger. La solicitud se cancelará y, si aún hay tiempo, tu donación volverá a publicarse para otras beneficiarias.' : role === 'organizacion' ? 'Avisa al donante que no podrán recogerlo. Tu solicitud se cancelará y la donación volverá a publicarse para otras beneficiarias.' : 'El recojo se anulará y la donación volverá a publicarse si su plazo sigue vigente. Se avisará a las dos partes.';
    ctx.openDialog(role === 'donante' ? 'No vinieron a recoger' : role === 'organizacion' ? 'No podremos recogerlo' : 'Anular recojo', `<form id="custody-release-form" data-id="${selected.id_seguimiento}"><p class="dialog-intro">${intro}</p><label>¿Por qué?<textarea class="form-control" name="motivo" required minlength="5" maxlength="1000" placeholder="${role === 'donante' ? 'Ej. Esperamos hasta las 6 p. m. y nadie vino.' : 'Ej. Se malogró nuestra movilidad.'}"></textarea></label><div class="mvp-message error" data-custody-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn btn-danger" type="submit">Confirmar</button></div></form>`);
  }
  function incidentDialog(id) {
    const options = records.filter(t => !['cancelada'].includes(t.donacion_estado)).map(t => `<option value="${t.id_seguimiento}" ${Number(id) === t.id_seguimiento ? 'selected' : ''}>#${t.id_seguimiento} · ${e(t.alimento)}</option>`).join('');
    ctx.openDialog('Reportar incidencia', `<form id="custody-incident-form"><p class="dialog-intro">Cuéntanos qué pasó. Lo verán el donante, la beneficiaria y administración.</p><label>¿En qué recojo?<select class="form-control" name="id_seguimiento" required>${options}</select></label><div class="form-grid"><label>¿Qué tipo de problema?<select class="form-control" name="tipo"><option value="demora">Llegó tarde o hubo retraso</option><option value="temperatura">No se mantuvo frío o caliente</option><option value="envase">Envase roto o abierto</option><option value="calidad">El alimento está en mal estado</option><option value="otro">Otro</option></select></label><label>¿Qué tan grave es?<select class="form-control" name="severidad"><option value="media">Importante, hay que revisarlo</option><option value="alta">Grave, hay que parar la entrega</option><option value="baja">Leve, solo para que quede anotado</option></select></label><label class="full">Resúmelo en una frase<input class="form-control" name="titulo" minlength="5" maxlength="180" required placeholder="Ej. Una caja llegó abierta"></label><label class="full">Cuéntanos qué pasó<textarea class="form-control" name="descripcion" minlength="10" maxlength="2500" required placeholder="¿Qué viste? ¿Cuándo pasó? ¿Qué hicieron?"></textarea></label></div><div class="mvp-message error" data-custody-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn btn-primary" type="submit">Enviar reporte</button></div></form>`);
  }
  function incidentCard(i) {
    return `<article class="custody-incident-card severity-${e(i.severidad)}"><div class="incident-icon"><i class="fa-solid ${i.estado === 'resuelta' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i></div><div class="incident-content"><div class="incident-title-row"><span class="section-kicker">INCIDENCIA #${i.id_incidencia} · ${e(i.tipo)} · ${e(i.severidad)}</span><span class="custody-badge ${i.estado}">${i.estado === 'resuelta' ? 'Resuelta' : 'Abierta'}</span></div><h3>${e(i.titulo)}</h3>${i.alimento ? `<strong class="incident-food">${e(i.alimento)} · ${e(i.origen?.nombre || '')}${i.destino?.nombre ? ` → ${e(i.destino.nombre)}` : ''}</strong>` : ''}<p>${e(i.descripcion)}</p><small>${dt(i.fecha_creacion)} · ${e(i.actor_nombre)}</small>${i.resolucion ? `<div class="incident-resolution"><strong>Cómo se resolvió</strong><p>${e(i.resolucion)}</p><small>${e(i.resuelto_por)} · ${dt(i.fecha_resolucion)}</small></div>` : ''}<div class="incident-actions">${currentView === 'incidencias' && i.id_seguimiento ? button('Ver recojo', 'open-tracking', i.id_seguimiento) : ''}${i.estado === 'abierta' && ctx.role === 'administrador' ? button('Registrar solución', 'resolve', i.id_incidencia, 'btn-primary') : ''}</div></div></article>`;
  }
  async function renderIncidents() {
    const list = (await REA.request('/api/incidencias')).data;
    ctx.setContent(`${ctx.heading('Incidencias', 'Problemas reportados en los recojos y entregas, y cómo se resolvieron.', records.some(t => !closed(t)) ? button('<i class="fa-solid fa-plus"></i> Reportar incidencia', 'incident', '', 'btn-primary') : '')}
      <div class="custody-overview"><article><span class="custody-overview-icon amber"><i class="fa-solid fa-triangle-exclamation"></i></span><div><strong>${list.filter(i => i.estado === 'abierta').length}</strong><span>abiertas</span></div></article><article><span class="custody-overview-icon red"><i class="fa-solid fa-shield"></i></span><div><strong>${list.filter(i => i.estado === 'abierta' && i.severidad === 'alta').length}</strong><span>graves</span></div></article><article><span class="custody-overview-icon"><i class="fa-solid fa-check-double"></i></span><div><strong>${list.filter(i => i.estado === 'resuelta').length}</strong><span>resueltas</span></div></article></div>
      <section class="mvp-panel incident-board"><div class="mvp-request-tabs"><button type="button" class="active" data-incident-filter="todos">Todas</button><button type="button" data-incident-filter="abierta">Abiertas</button><button type="button" data-incident-filter="resuelta">Resueltas</button></div><div data-incident-list></div><p class="custody-small-note">Resolver una incidencia no certifica que el alimento sea apto para el consumo.</p></section>`, 'Incidencias');
    const paint = () => { $('[data-incident-list]').innerHTML = list.filter(i => filter === 'todos' || i.estado === filter).map(incidentCard).join('') || '<div class="custody-no-alert"><i class="fa-solid fa-shield-heart"></i><span>No hay incidencias en esta vista.</span></div>'; };
    filter = 'todos'; paint();
    ctx.main.querySelectorAll('[data-incident-filter]').forEach(el => el.addEventListener('click', () => { filter = el.dataset.incidentFilter; ctx.main.querySelectorAll('[data-incident-filter]').forEach(b => b.classList.toggle('active', b === el)); paint(); }));
  }
  document.addEventListener('input', event => { if (ctx && event.target.matches('[data-custody-search]')) renderList(event.target.value); });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-custody-action]'); if (!el || !ctx) return;
    const a = el.dataset.custodyAction; el.disabled = true;
    try {
      if (a === 'select') await select(Number(el.dataset.id));
      else if (a === 'refresh') await render(currentView);
      else if (a === 'step') stepDialog(el.dataset.id);
      else if (a === 'release') releaseDialog();
      else if (a === 'incident') incidentDialog(el.dataset.id || selected?.id_seguimiento || records[0]?.id_seguimiento);
      else if (a === 'close') ctx.closeDialog();
      else if (a === 'open-tracking') { selected = { id_seguimiento: Number(el.dataset.id) }; ctx.main.closest('body')?.querySelector('.sidebar-nav [data-view="seguimiento"]')?.click(); }
      else if (a === 'resolve') ctx.openDialog('Registrar solución', `<form id="custody-resolution-form" data-id="${Number(el.dataset.id)}"><p class="dialog-intro">Cuenta qué se hizo para solucionar el problema. Avisaremos al donante y a la beneficiaria.</p><label>¿Cómo se solucionó?<textarea class="form-control" name="resolucion" required minlength="10" maxlength="2500" placeholder="Ej. Se revisó la caja y el donante repuso el alimento."></textarea></label><div class="mvp-message error" data-custody-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn btn-primary" type="submit">Guardar solución</button></div></form>`);
    } catch (error) { ctx.toast(error.message); } finally { el.disabled = false; }
  });
  document.addEventListener('submit', async event => {
    const form = event.target; if (!ctx || !['custody-event-form', 'custody-release-form', 'custody-incident-form', 'custody-resolution-form'].includes(form.id)) return;
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]'), original = submit.innerHTML; submit.disabled = true; submit.innerHTML = '<span class="loading-spinner small"></span> Guardando…';
    const errorEl = form.querySelector('[data-custody-form-error]'); if (errorEl) errorEl.hidden = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      if (form.id === 'custody-event-form') {
        body.tipo = form.dataset.type; body.version = Number(form.dataset.version);
        await REA.request(`/api/seguimiento/${Number(form.dataset.id)}/hitos`, { method: 'POST', body });
        ctx.closeDialog(); await select(Number(form.dataset.id)); ctx.toast(body.tipo === 'observacion' ? 'Nota guardada.' : 'Listo. Avisamos a la otra parte.');
      } else if (form.id === 'custody-release-form') {
        const result = await REA.request(`/api/seguimiento/${Number(form.dataset.id)}/anular`, { method: 'POST', body });
        ctx.closeDialog(); selected = null; await ctx.reload?.(); await render('seguimiento');
        ctx.toast(result.data.reabierta ? 'Recojo anulado. La donación volvió a publicarse y avisamos a la otra parte.' : 'Recojo anulado. El plazo de la donación ya había terminado.');
      } else if (form.id === 'custody-incident-form') {
        await REA.request(`/api/seguimiento/${Number(body.id_seguimiento)}/incidencias`, { method: 'POST', body }); ctx.closeDialog(); await render(currentView); ctx.toast('Incidencia registrada. Administración la revisará.');
      } else {
        await REA.request(`/api/incidencias/${Number(form.dataset.id)}/resolver`, { method: 'POST', body }); ctx.closeDialog(); await render(currentView); ctx.toast('Solución guardada y comunicada a las dos partes.');
      }
    } catch (error) { if (errorEl) { errorEl.textContent = error.message; errorEl.hidden = false; errorEl.focus(); } }
    finally { submit.disabled = false; submit.innerHTML = original; }
  });
  window.REACustody = { configure(value) { ctx = value; }, render, current: () => currentView, setTarget(id) { selected = { id_seguimiento: Number(id) }; }, open(id) { selected = { id_seguimiento: Number(id) }; document.querySelector('.sidebar-nav [data-view="seguimiento"]')?.click(); } };
})();
