/* Panel de administración: cuentas (expediente de verificación, edición, desactivación), donaciones y solicitudes,
   listas del sistema y reportes de impacto. */
(() => {
  let ctx, fileAccountId = null, file = null, accounts = [], filters = { rol: '', verificacion: '', estado: '' }, report = null, lastPeriod = { desde: '', hasta: '' };
  const $ = s => ctx.main.querySelector(s);
  const e = v => ctx.escape(v), n = v => ctx.number(v);
  const VERIFICATION = { pendiente: 'Pendiente', en_revision: 'En revisión', verificado: 'Verificada', rechazado: 'Rechazada' };
  const ACCOUNT = { pendiente: 'Sin aprobar', activo: 'Activa', suspendido: 'Desactivada' };
  const ROLES = { donante: 'Donante', organizacion: 'Beneficiaria' };
  const button = (text, action, id = '', cls = 'btn-secondary') => `<button type="button" class="btn ${cls}" data-admin-action="${action}" ${id !== '' ? `data-id="${e(id)}"` : ''}>${text}</button>`;
  const tag = (text, tone) => `<span class="mvp-badge status-${tone}"><span></span>${e(text)}</span>`;
  const pairs = list => `<dl class="admin-facts">${list.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>`;

  // ---------- Cuentas ----------
  async function renderAccounts() {
    accounts = (await REA.request('/api/admin/cuentas')).data;
    const count = fn => accounts.filter(fn).length;
    ctx.setContent(`${ctx.heading('Cuentas de la red', 'Revisa los datos de cada donante y beneficiaria, verifica su cuenta o toma una medida justificada.', button('<i class="fa-solid fa-rotate"></i> Actualizar', 'refresh-accounts'))}
      <div class="custody-overview"><article><span class="custody-overview-icon amber"><i class="fa-solid fa-hourglass-half"></i></span><div><strong>${count(a => ['pendiente', 'en_revision'].includes(a.estado_verificacion))}</strong><span>por verificar</span></div></article><article><span class="custody-overview-icon"><i class="fa-solid fa-user-check"></i></span><div><strong>${count(a => a.estado_verificacion === 'verificado' && a.estado !== 'suspendido')}</strong><span>verificadas y activas</span></div></article><article><span class="custody-overview-icon red"><i class="fa-solid fa-user-slash"></i></span><div><strong>${count(a => a.estado === 'suspendido')}</strong><span>desactivadas</span></div></article></div>
      <div class="mvp-filter-panel admin-filters"><select data-admin-filter="rol" aria-label="Tipo de cuenta"><option value="">Donantes y beneficiarias</option><option value="donante">Solo donantes</option><option value="organizacion">Solo beneficiarias</option></select><select data-admin-filter="verificacion" aria-label="Verificación"><option value="">Cualquier verificación</option>${Object.entries(VERIFICATION).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><select data-admin-filter="estado" aria-label="Estado de la cuenta"><option value="">Cualquier estado</option>${Object.entries(ACCOUNT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="admin-account-list" data-account-list></div>`, 'Cuentas');
    for (const [key, value] of Object.entries(filters)) { const select = $(`[data-admin-filter="${key}"]`); if (select) select.value = value; }
    paintAccounts();
  }
  function paintAccounts() {
    const list = accounts.filter(a => (!filters.rol || a.rol === filters.rol) && (!filters.verificacion || a.estado_verificacion === filters.verificacion) && (!filters.estado || a.estado === filters.estado));
    $('[data-account-list]').innerHTML = list.map(accountCard).join('') || '<div class="mvp-panel mvp-empty"><span class="empty-icon"><i class="fa-solid fa-users"></i></span><h2>No hay cuentas con estos filtros.</h2><p>Cambia los filtros para ver otras cuentas.</p></div>';
  }
  function accountCard(a) {
    const p = a.perfil || {};
    const entity = p.nombre_establecimiento || p.nombre || 'Sin perfil';
    const facts = a.rol === 'donante'
      ? [['RUC registrado', p.ruc], ['DNI del representante', p.dni_representante], ['Representante', a.nombre], ['Celular', a.telefono], ['Correo', a.correo], ['Dirección', [p.direccion, p.distrito].filter(Boolean).join(' · ')], ['Donaciones registradas', a.registros]]
      : [['Tipo', p.tipo_organizacion], ['Código de registro', p.codigo_registro || 'Sin registrar'], ['Personas que atiende', p.numero_beneficiarios], ['DNI del representante', p.dni_representante], ['Representante', a.nombre], ['Celular', a.telefono], ['Correo', a.correo], ['Dirección', [p.direccion, p.distrito].filter(Boolean).join(' · ')], ['Solicitudes registradas', a.registros]];
    const decision = a.ultima_decision ? `<p class="decision-note"><i class="fa-solid fa-gavel"></i> Última decisión (${ctx.date(a.ultima_decision.fecha)}): ${e({ cambiar_verificacion: `verificación ${VERIFICATION[a.ultima_decision.estado] || ''}`, suspender_cuenta: 'cuenta desactivada', reactivar_cuenta: 'cuenta reactivada', habilitar_subsanacion: 'se habilitó la subsanación' }[a.ultima_decision.accion] || a.ultima_decision.accion)}${a.ultima_decision.motivo ? ` · ${e(a.ultima_decision.motivo)}` : ''}</p>` : '';
    const vTone = { pendiente: 'pendiente', en_revision: 'en_revision', verificado: 'aceptada', rechazado: 'rechazada' }[a.estado_verificacion];
    const actions = [button('<i class="fa-solid fa-folder-open"></i> Expediente de verificación', 'open-file', a.id_usuario, 'btn-primary'), button('<i class="fa-regular fa-pen-to-square"></i> Editar datos', 'edit-account', a.id_usuario)];
    actions.push(a.estado === 'suspendido' ? button('<i class="fa-solid fa-user-plus"></i> Reactivar cuenta', 'reactivate', a.id_usuario) : button('<i class="fa-solid fa-user-slash"></i> Desactivar cuenta', 'suspend', a.id_usuario, 'btn-danger-outline'));
    if (!a.registros && !a.es_demostracion) actions.push(button('<i class="fa-regular fa-trash-can"></i> Eliminar', 'delete-account', a.id_usuario, 'btn-danger-outline'));
    return `<article class="mvp-panel admin-account-card"><div class="request-card-header">${p.foto_url ? `<button type="button" class="admin-photo" data-admin-action="photo" data-id="${a.id_usuario}" aria-label="Ver la foto del local de ${e(entity)}"><img src="${e(p.foto_url)}" alt="" loading="lazy"></button>` : '<span class="profile-photo md"><span><i class="fa-solid fa-store"></i></span></span>'}<div><span class="section-kicker">${e(ROLES[a.rol])} · CUENTA #${a.id_usuario}${a.es_demostracion ? ' · PRUEBA' : ''}</span><h2>${e(entity)}</h2><small class="request-entity-note">Registrada ${ctx.date(a.fecha_registro)}</small></div><div class="admin-badges">${tag(VERIFICATION[a.estado_verificacion] || a.estado_verificacion, vTone)}${tag(ACCOUNT[a.estado] || a.estado, a.estado === 'suspendido' ? 'cancelada' : a.estado === 'activo' ? 'disponible' : 'pendiente')}</div></div>${pairs(facts)}${decision}<div class="request-card-actions">${actions.join('')}</div></article>`;
  }
  const account = id => accounts.find(a => String(a.id_usuario) === String(id));
  function verifyDialog(a) {
    ctx.openDialog(`Verificación de ${a.perfil?.nombre_establecimiento || a.perfil?.nombre || a.nombre}`, `<form id="admin-verify-form" data-id="${a.id_usuario}"><p class="dialog-intro">Revisa el DNI${a.rol === 'donante' ? ', el RUC' : ''} y la foto del local antes de decidir. Avisaremos a la cuenta con el motivo que escribas.</p><label>Nuevo estado<select class="form-control" name="estado" required>${Object.entries(VERIFICATION).map(([k, v]) => `<option value="${k}" ${a.estado_verificacion === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Motivo <small>(obligatorio si se rechaza)</small><textarea class="form-control" name="motivo" maxlength="1000" placeholder="Ej. El RUC no corresponde al nombre del negocio."></textarea></label><div class="mvp-message error" data-admin-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn btn-primary" type="submit">Guardar</button></div></form>`);
  }
  function suspendDialog(a) {
    ctx.openDialog('Desactivar cuenta', `<form id="admin-suspend-form" data-id="${a.id_usuario}"><p class="dialog-intro">La cuenta no podrá entrar, pero se conservan sus datos, documentos e historial. ${a.rol === 'donante' ? 'Sus donaciones sin recoger se cancelarán' : 'Sus solicitudes pendientes se cancelarán y sus recojos aceptados sin recoger se anularán'}, y avisaremos a la otra parte. El historial se conserva.</p><label>Motivo justificado<textarea class="form-control" name="motivo" required minlength="10" maxlength="1000" placeholder="Ej. Publicó alimentos vencidos en dos ocasiones."></textarea></label><div class="mvp-message error" data-admin-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn btn-danger" type="submit">Desactivar cuenta</button></div></form>`);
  }
  function reasonDialog(id, title, intro, formId, label) {
    const min = ['admin-reactivate-form'].includes(formId) ? 5 : 10;
    ctx.openDialog(title, `<form id="${formId}" data-id="${id}"><p class="dialog-intro">${intro}</p><label>${label}<textarea class="form-control" name="${formId === 'admin-subsanation-form' ? 'instrucciones' : 'motivo'}" required minlength="${min}" maxlength="1000"></textarea></label><div class="mvp-message error" data-admin-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn ${['admin-delete-form', 'admin-cancel-donation-form', 'admin-cancel-request-form'].includes(formId) ? 'btn-danger' : 'btn-primary'}" type="submit">${title}</button></div></form>`);
  }

  // ---------- Expediente de verificación (lo llena solo el administrador) ----------
  const kind = tipo => { const t = String(tipo || '').toLocaleLowerCase('es'); return t.includes('olla') ? 'olla' : t.includes('comedor') ? 'comedor' : t.includes('vaso') ? 'vaso' : 'otro'; };
  const CODE_HINT = {
    olla: 'Ingrese el código RUNOC, si la organización cuenta con uno.',
    comedor: 'Ingrese el código RUOS otorgado por la municipalidad correspondiente, si la organización cuenta con uno.',
    vaso: 'Ingrese el código RUOS otorgado por la municipalidad correspondiente, si la organización cuenta con uno.',
    otro: 'Ingrese el código de registro oficial, si la organización cuenta con uno.'
  };
  const MUNICIPAL_DOCS = 'Documentos de referencia: resolución o constancia de reconocimiento municipal, constancia RUOS, acta de constitución, documentos de la junta directiva, padrón de integrantes u otras evidencias disponibles.';
  const DOCS_HINT = {
    olla: 'Documentos de referencia: acta de constitución, reconocimiento municipal, constancia o registro RUNOC, documentos de la representante, padrón de beneficiarios u otras evidencias disponibles.',
    comedor: MUNICIPAL_DOCS, vaso: MUNICIPAL_DOCS,
    otro: 'Documentos de referencia: reconocimiento municipal, acta de constitución, documentos de la representante, padrón de beneficiarios u otras evidencias disponibles.',
    donante: 'Documentos de referencia: ficha RUC, fotos del local, licencia de funcionamiento u otros documentos de sustento.'
  };
  const RESULT = { en_revision: 'En revisión', verificado: 'Verificada', rechazado: 'Rechazada', pendiente: 'Pendiente', subsanacion_habilitada: 'Se habilitó la subsanación' };
  const RESULT_TONE = { en_revision: 'en_revision', verificado: 'aceptada', rechazado: 'rechazada', pendiente: 'pendiente', subsanacion_habilitada: 'pendiente' };
  const docLink = d => `<a href="${e(d.url)}" target="_blank" rel="noopener"><i class="fa-regular ${d.tipo_mime === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-image'}"></i> ${e(d.nombre)}</a>`;
  function openFile(userId) { fileAccountId = Number(userId); return ctx.navigate('expediente'); }
  async function renderFile() {
    if (!fileAccountId) { await ctx.navigate('cuentas'); return; }
    file = (await REA.request(`/api/admin/cuentas/${fileAccountId}/expediente`)).data;
    const a = file.cuenta, p = a.perfil || {}, donor = a.rol === 'donante', k = donor ? 'donante' : kind(p.tipo_organizacion);
    const entity = p.nombre_establecimiento || p.nombre || a.nombre;
    const pending = file.documentos.filter(d => !d.id_verificacion);
    const locked = a.estado_verificacion === 'rechazado' && !p.subsanacion_habilitada;
    const registered = donor
      ? [['Negocio', entity], ['RUC registrado', p.ruc], ['Representante', a.nombre], ['DNI del representante', p.dni_representante], ['Celular', a.telefono], ['Correo', a.correo], ['Dirección', [p.direccion, p.referencia && `Ref.: ${p.referencia}`, p.distrito].filter(Boolean).join(' · ')], ['Registrada', ctx.date(a.fecha_registro)]]
      : [['Entidad', entity], ['Tipo', p.tipo_organizacion], ['Personas que atiende', p.numero_beneficiarios], ['Representante', a.nombre], ['DNI del representante', p.dni_representante], ['Celular', a.telefono], ['Correo', a.correo], ['Dirección', [p.direccion, p.referencia && `Ref.: ${p.referencia}`, p.distrito].filter(Boolean).join(' · ')], ['Registrada', ctx.date(a.fecha_registro)]];
    const history = file.historial.map(v => `<li class="file-entry"><div class="card-title-row"><span><strong>${ctx.date(v.fecha)}</strong> · ${e(v.administrador)}</span>${tag(RESULT[v.resultado] || v.resultado, RESULT_TONE[v.resultado] || 'pendiente')}</div>${v.tipos.length ? `<p><strong>Verificación realizada:</strong> ${e(v.tipos.join(', '))}</p>` : ''}${v.codigo_registro ? `<p><strong>Código de registro:</strong> ${e(v.codigo_registro)}</p>` : ''}${v.ruc ? `<p><strong>RUC:</strong> ${e(v.ruc)}</p>` : ''}${v.observaciones ? `<p><strong>${v.resultado === 'subsanacion_habilitada' ? 'Qué debe presentar' : 'Observaciones'}:</strong> ${e(v.observaciones)}</p>` : ''}${v.motivo ? `<p><strong>Motivo:</strong> ${e(v.motivo)}</p>` : ''}${v.resultado === 'rechazado' ? `<p class="small-muted">${v.subsanable ? 'Rechazo subsanable: se habilitó presentar documentación adicional.' : 'Rechazo no subsanable.'}</p>` : ''}${v.documentos.length ? `<ul class="document-list">${v.documentos.map(d => `<li>${docLink(d)}<small>${d.origen === 'cuenta' ? 'Presentado por la cuenta' : `Adjuntado por ${e(d.subido_por || 'administración')}`}</small></li>`).join('')}</ul>` : ''}</li>`).join('');
    ctx.setContent(`${ctx.heading(`Expediente: ${entity}`, 'Lo completa solo administración. El registro de la cuenta no cambia; aquí se documenta su verificación.', button('<i class="fa-solid fa-arrow-left"></i> Volver a cuentas', 'back-accounts'))}
      <div class="file-layout"><div class="file-main">
        <section class="mvp-panel"><div class="card-title-row"><h2>Datos que registró la cuenta</h2><div class="admin-badges">${tag(VERIFICATION[a.estado_verificacion] || a.estado_verificacion, RESULT_TONE[a.estado_verificacion] || 'pendiente')}${tag(ACCOUNT[a.estado] || a.estado, a.estado === 'suspendido' ? 'cancelada' : a.estado === 'activo' ? 'disponible' : 'pendiente')}</div></div>${pairs(registered)}${p.foto_url ? `<img class="file-photo" src="${e(p.foto_url)}" alt="Foto del local de ${e(entity)}">` : ''}</section>
        <form id="admin-evaluation-form" class="mvp-panel file-form" data-id="${a.id_usuario}"><h2>Nueva evaluación</h2>${locked ? `<div class="mvp-message warning"><i class="fa-solid fa-lock"></i> La cuenta fue rechazada. Para evaluarla de nuevo, habilita primero la presentación de documentación adicional.</div>${button('<i class="fa-solid fa-folder-plus"></i> Habilitar nueva evaluación', 'enable-subsanation', a.id_usuario, 'btn-primary')}` : `
          ${donor ? `<label>RUC<input class="form-control" name="ruc" value="${e(p.ruc || '')}" inputmode="numeric" minlength="11" maxlength="11" placeholder="Ej. 20123456789"><small class="field-hint">Es el RUC que registró el donante. Corrígelo si la ficha RUC muestra otro número.</small></label>` : `<label>Código de registro <small>(opcional)</small><input class="form-control" name="codigo_registro" value="${e(p.codigo_registro || '')}" maxlength="50" placeholder="Ej. RUNOC-2026-0451"><small class="field-hint">${CODE_HINT[k]}</small></label>`}
          <div class="file-docs"><span class="file-label">Documentación de respaldo</span><small class="field-hint">${DOCS_HINT[k]} Son referencias para orientar la evaluación, no una lista de requisitos obligatorios.</small><label class="btn btn-secondary file-upload"><i class="fa-solid fa-paperclip"></i> Adjuntar archivos<input type="file" data-admin-documents multiple accept="application/pdf,image/jpeg,image/png,image/webp" hidden></label><small class="field-hint">PDF, JPG, PNG o WebP, hasta 10 MB cada uno. Se guardan con esta evaluación.</small><ul class="document-list">${pending.map(d => `<li>${docLink(d)}<small>${d.origen === 'cuenta' ? 'Presentado por la cuenta' : 'Por registrar'}</small>${d.origen === 'cuenta' ? '' : button('<i class="fa-solid fa-xmark"></i>', 'remove-document', d.id_documento, 'btn-icon btn-danger-outline')}</li>`).join('') || '<li class="small-muted">Todavía no hay documentos para esta evaluación.</li>'}</ul></div>
          <fieldset class="file-types"><legend>Tipo de verificación realizada</legend>${file.tipos.map(t => `<label class="check-row"><input type="checkbox" name="tipos" value="${e(t)}"><span>${e(t)}</span></label>`).join('')}</fieldset>
          <label>Resultado<select class="form-control" name="resultado" required><option value="en_revision">En revisión (falta información)</option><option value="verificado">Verificada: la evaluación es conforme</option><option value="rechazado">Rechazada: no se acreditó o hay inconsistencias</option></select></label>
          <label>Observaciones<textarea class="form-control" name="observaciones" maxlength="2500" placeholder="Ej. Se revisó el acta de constitución y se llamó a la presidenta."></textarea></label>
          <div data-rejection hidden><label>Motivo del rechazo<textarea class="form-control" name="motivo" minlength="10" maxlength="1000" placeholder="Ej. El código RUOS no corresponde a esta organización."></textarea><small class="field-hint">Se comunica a la cuenta.</small></label><label class="check-row"><input type="checkbox" name="subsanable"><span><strong>El rechazo es subsanable</strong>Permitir que presente documentación adicional para una nueva evaluación.</span></label></div>
          <div class="mvp-message error" data-admin-form-error tabindex="-1" hidden></div><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Registrar evaluación</button>`}</form>
      </div><aside class="file-side"><section class="mvp-panel"><h2>Historial de verificación</h2>${history ? `<ol class="file-history">${history}</ol>` : '<p class="small-muted">Todavía no hay evaluaciones registradas.</p>'}</section>
        <section class="mvp-panel"><h2>Acceso a la cuenta</h2><p class="small-muted">Desactivar retira el acceso pero conserva los datos, documentos e historial. No se elimina nada.</p>${a.estado === 'suspendido' ? button('<i class="fa-solid fa-user-plus"></i> Reactivar cuenta', 'reactivate', a.id_usuario) : button('<i class="fa-solid fa-user-slash"></i> Desactivar cuenta', 'suspend', a.id_usuario, 'btn-danger-outline')}</section></aside></div>`, 'Expediente de verificación');
    const form = $('#admin-evaluation-form');
    form?.resultado?.addEventListener('change', () => { const rejected = form.resultado.value === 'rechazado'; $('[data-rejection]').hidden = !rejected; form.motivo.required = rejected; });
  }
  function accountDialog(a) {
    const p = a.perfil || {}, donor = a.rol === 'donante';
    const types = [...new Set([...(window.REAPuno?.TIPOS_ORGANIZACION || []), p.tipo_organizacion].filter(Boolean))];
    const field = (label, name, value, extra = '') => `<label>${label}<input class="form-control" name="${name}" value="${e(value ?? '')}" ${extra}></label>`;
    ctx.openDialog(`Editar datos de ${p.nombre_establecimiento || p.nombre || a.nombre}`, `<form id="admin-account-form" data-id="${a.id_usuario}"><p class="dialog-intro">Corrige los datos de la cuenta. Avisaremos a la cuenta del cambio.</p><div class="form-grid">${field(donor ? 'Nombre del negocio' : 'Nombre de la entidad', 'entidad', p.nombre_establecimiento || p.nombre, 'required maxlength="200"')}${donor ? field('RUC', 'ruc', p.ruc, 'required inputmode="numeric" minlength="11" maxlength="11"') : `<label>Tipo de organización<select class="form-control" name="tipo_organizacion" required>${types.map(t => `<option ${t === p.tipo_organizacion ? 'selected' : ''}>${e(t)}</option>`).join('')}</select></label>${field('Personas que atiende', 'numero_beneficiarios', p.numero_beneficiarios, 'required inputmode="numeric" maxlength="6"')}`}${field('Representante', 'nombre', a.nombre, 'required maxlength="150"')}${field('DNI del representante', 'dni_representante', p.dni_representante, 'inputmode="numeric" minlength="8" maxlength="8"')}${field('Celular o teléfono', 'telefono', a.telefono, 'required inputmode="numeric" maxlength="9"')}${field('Correo electrónico', 'correo', a.correo, `required type="email" maxlength="150" ${a.es_demostracion ? 'readonly' : ''}`)}<label>Provincia<select class="form-control" name="provincia" required>${REARules.provinceOptions(p.provincia || 'Puno')}</select></label><label>Distrito<select class="form-control" name="distrito" required>${REARules.districtOptions(p.provincia || 'Puno', p.distrito)}</select></label>${field('Dirección', 'direccion', p.direccion, 'required maxlength="255"')}${field('Referencia', 'referencia', p.referencia, 'maxlength="200"')}</div><p class="small-muted">La ubicación en el mapa se conserva.</p><div class="mvp-message error" data-admin-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn btn-primary" type="submit">Guardar cambios</button></div></form>`);
  }
  async function donationDialog(donationId) {
    const d = (await REA.request(`/api/donaciones/${donationId}`)).data;
    const types = [...new Set([...(window.REAPuno?.TIPOS_ALIMENTO || []), d.categoria].filter(Boolean))];
    const local = value => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(' ', 'T') : '';
    const field = (label, name, value, extra = '') => `<label>${label}<input class="form-control" name="${name}" value="${e(value ?? '')}" ${extra}></label>`;
    ctx.openDialog(`Editar donación #${d.id_donacion}`, `<form id="admin-donation-form" data-id="${d.id_donacion}"><p class="dialog-intro">Corrige los datos de la publicación. Avisaremos al donante y a las beneficiarias que la pidieron.</p><div class="form-grid">${field('Alimento', 'alimento', d.alimento, 'required maxlength="160"')}<label>Tipo de alimento<select class="form-control" name="categoria">${types.map(t => `<option ${t === d.categoria ? 'selected' : ''}>${e(t)}</option>`).join('')}</select></label>${field('Cantidad', 'cantidad', d.cantidad, 'required inputmode="decimal"')}${field('Medida', 'unidad', d.unidad, 'required maxlength="50"')}${field('Se puede recoger hasta', 'fecha_limite_recojo', local(d.fecha_limite_recojo), 'type="datetime-local" required')}${field('Cómo debe guardarse', 'conservacion_declarada', d.conservacion_declarada, 'required maxlength="100"')}${field('Envase', 'envase', d.envase, 'required maxlength="100"')}<label class="full">Detalles<textarea class="form-control" name="descripcion" maxlength="2500">${e(d.descripcion)}</textarea></label><label class="full">Indicaciones para el recojo<textarea class="form-control" name="observaciones" maxlength="2500">${e(d.observaciones)}</textarea></label></div><div class="mvp-message error" data-admin-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver', 'close')}<button class="btn btn-primary" type="submit">Guardar cambios</button></div></form>`);
  }
  async function afterRecordChange(message) {
    ctx.closeDialog(); await ctx.reload();
    const current = ctx.current();
    if (current === 'detalle') await ctx.navigate('detalle', { id: ctx.selected()?.id_donacion }); else await ctx.navigate(current);
    ctx.toast(message);
  }

  // ---------- Listas del sistema ----------
  async function renderLists() {
    const lists = (await REA.request('/api/admin/catalogos')).data;
    ctx.setContent(`${ctx.heading('Listas del sistema', 'Agrega o quita opciones de los formularios. Desactivar una opción la oculta para los nuevos registros sin cambiar los existentes.')}
      <div class="admin-lists">${Object.entries(lists).map(([tipo, list]) => `<section class="mvp-panel admin-list"><h2>${e(list.nombre)}</h2><ul>${list.valores.map(v => `<li class="${v.activo ? '' : 'inactive'}"><span><strong>${e(v.valor)}</strong><small>${v.en_uso ? `${v.en_uso} registro(s) la usan` : 'Sin uso todavía'}${v.activo ? '' : ' · desactivada'}</small></span><span class="admin-list-actions">${button(v.activo ? 'Desactivar' : 'Activar', 'toggle-value', v.id_catalogo, v.activo ? 'btn-secondary' : 'btn-primary')}${v.en_uso ? '' : button('<i class="fa-regular fa-trash-can"></i>', 'delete-value', v.id_catalogo, 'btn-icon btn-danger-outline')}</span></li>`).join('')}</ul><form class="admin-add-value" data-tipo="${e(tipo)}"><label class="sr-only" for="add-${e(tipo)}">Nueva opción</label><input id="add-${e(tipo)}" class="form-control" name="valor" required minlength="3" maxlength="100" placeholder="${tipo === 'tipo_organizacion' ? 'Ej. Albergue infantil' : 'Ej. Bebidas y jugos'}"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-plus"></i> Agregar</button></form></section>`).join('')}</div>`, 'Listas del sistema');
    ctx.main.querySelectorAll('[data-admin-action="toggle-value"]').forEach(el => { el.dataset.activo = el.textContent.trim() === 'Activar' ? 'true' : 'false'; });
  }

  // ---------- Reportes ----------
  async function renderReports(period = lastPeriod) {
    lastPeriod = period;
    const query = new URLSearchParams(Object.entries(period).filter(([, v]) => v)).toString();
    report = (await REA.request(`/api/admin/reportes${query ? `?${query}` : ''}`)).data;
    const r = report.resumen;
    const metric = (icon, value, title) => `<article class="mvp-metric"><span class="metric-icon"><i class="fa-solid ${icon}"></i></span><strong>${e(value)}</strong><h2>${title}</h2></article>`;
    const table = (title, headers, rows) => `<section class="mvp-panel table-wrap"><h2>${title}</h2><table class="data-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}">Sin entregas en este periodo.</td></tr>`}</tbody></table></section>`;
    ctx.setContent(`${ctx.heading('Reportes de impacto', 'Cuánto alimento llegó a las beneficiarias y a cuántas personas atienden.', button('<i class="fa-solid fa-file-csv"></i> Descargar CSV', 'export-csv', '', 'btn-primary'))}
      <form class="mvp-filter-panel admin-period" id="admin-report-form"><label>Desde<input class="form-control" type="date" name="desde" value="${e(period.desde)}"></label><label>Hasta<input class="form-control" type="date" name="hasta" value="${e(period.hasta)}"></label><button class="btn btn-secondary" type="submit"><i class="fa-solid fa-filter"></i> Ver periodo</button>${period.desde || period.hasta ? button('Todo el historial', 'clear-period') : ''}</form>
      <div class="mvp-metrics">${metric('fa-circle-check', r.entregas_completadas, 'Entregas recibidas')}${metric('fa-triangle-exclamation', r.entregas_con_problemas, 'Recibidas con problemas')}${metric('fa-people-roof', r.beneficiarias_atendidas, 'Beneficiarias atendidas')}${metric('fa-users', n(r.personas_estimadas), 'Personas que atienden (estimado)')}</div>
      <p class="small-muted report-note"><i class="fa-solid fa-circle-info"></i> Las personas son una estimación: se suma lo que cada beneficiaria declaró atender. Las cantidades se muestran por unidad porque no se pueden sumar kilos con litros o porciones. ${r.recojos_anulados} recojo(s) se anularon porque nadie recogió o la beneficiaria no pudo ir.</p>
      <div class="admin-report-grid">${table('Cantidad entregada por unidad', ['Unidad', 'Cantidad', 'Entregas'], report.por_unidad.map(x => `<tr><td>${e(x.unidad)}</td><td>${n(x.cantidad)}</td><td>${x.entregas}</td></tr>`))}${table('Por tipo de alimento', ['Tipo', 'Entregas'], report.por_tipo.map(x => `<tr><td>${e(x.clave)}</td><td>${x.entregas}</td></tr>`))}${table('Por distrito del donante', ['Distrito', 'Entregas'], report.por_distrito.map(x => `<tr><td>${e(x.clave)}</td><td>${x.entregas}</td></tr>`))}${table('Donaciones publicadas por estado', ['Estado', 'Cantidad'], Object.entries(report.donaciones).map(([k, v]) => `<tr><td>${e(ctx.label(k))}</td><td>${v}</td></tr>`))}</div>
      ${table('Entregas del periodo', ['Fecha', 'Alimento', 'Cantidad', 'Donante', 'Beneficiaria', 'Resultado'], report.entregas.map(x => `<tr><td>${ctx.date(x.fecha)}</td><td>${e(x.alimento)}<br><small>${e(x.tipo)}</small></td><td>${n(x.cantidad)} ${e(x.unidad)}</td><td>${e(x.donante)}<br><small>${e(x.distrito || '')}</small></td><td>${e(x.beneficiaria)}</td><td>${e(x.resultado)}</td></tr>`))}`, 'Reportes de impacto');
  }
  function exportCsv() {
    const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Fecha', 'Donación', 'Alimento', 'Tipo', 'Cantidad', 'Unidad', 'Donante', 'Distrito', 'Beneficiaria', 'Resultado'],
      ...report.entregas.map(x => [x.fecha ? new Date(x.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '', x.id_donacion, x.alimento, x.tipo, x.cantidad, x.unidad, x.donante, x.distrito, x.beneficiaria, x.resultado])];
    // BOM para que Excel abra bien las tildes; punto y coma como separador habitual en Excel en español.
    const blob = new Blob(['﻿' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `realimenta_entregas_${lastPeriod.desde || 'inicio'}_${lastPeriod.hasta || 'hoy'}.csv`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function render(view) {
    if (view === 'cuentas') await renderAccounts();
    else if (view === 'expediente') await renderFile();
    else if (view === 'listas') await renderLists();
    else await renderReports();
  }
  document.addEventListener('change', event => {
    if (!ctx || !event.target.matches('[data-admin-filter]')) return;
    filters[event.target.dataset.adminFilter] = event.target.value; paintAccounts();
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-admin-action]'); if (!el || !ctx) return;
    const a = el.dataset.adminAction, id = el.dataset.id; el.disabled = true;
    try {
      if (a === 'refresh-accounts') await renderAccounts();
      else if (a === 'verify') verifyDialog(account(id));
      else if (a === 'open-file') await openFile(id);
      else if (a === 'back-accounts') await ctx.navigate('cuentas');
      else if (a === 'edit-account') accountDialog(account(id) || file?.cuenta);
      else if (a === 'remove-document') { await REA.request(`/api/admin/documentos/${id}`, { method: 'DELETE' }); await renderFile(); ctx.toast('Documento quitado.'); }
      else if (a === 'enable-subsanation') reasonDialog(id, 'Habilitar nueva evaluación', 'La cuenta podrá presentar documentación adicional desde su perfil. Indica qué debe presentar; se lo avisaremos.', 'admin-subsanation-form', 'Qué debe presentar');
      else if (a === 'edit-donation') await donationDialog(id);
      else if (a === 'cancel-donation') reasonDialog(id, 'Cancelar donación', 'Se cancelará la publicación y sus solicitudes activas. Avisaremos al donante y a las beneficiarias.', 'admin-cancel-donation-form', 'Motivo');
      else if (a === 'cancel-request') reasonDialog(id, 'Cancelar solicitud', 'Se cancelará la solicitud pendiente. Avisaremos al donante y a la beneficiaria.', 'admin-cancel-request-form', 'Motivo');
      else if (a === 'suspend' && account(id)) suspendDialog(account(id));
      else if (a === 'reactivate') reasonDialog(id, 'Reactivar cuenta', 'La cuenta podrá volver a entrar. Le avisaremos con el motivo.', 'admin-reactivate-form', 'Motivo');
      else if (a === 'suspend' && !account(id) && file) suspendDialog(file.cuenta);
      else if (a === 'delete-account') reasonDialog(id, 'Eliminar cuenta', 'Se borrarán la cuenta, su perfil y su foto. Solo es posible porque no tiene donaciones ni solicitudes. Esta acción no se puede deshacer.', 'admin-delete-form', 'Motivo justificado');
      else if (a === 'photo') { const acc = account(id); ctx.openDialog(`Foto del local · ${acc.perfil?.nombre_establecimiento || acc.perfil?.nombre}`, `<img class="admin-photo-large" src="${e(acc.perfil.foto_url)}" alt="Foto del local"><div class="dialog-actions">${button('Cerrar', 'close')}</div>`); }
      else if (a === 'close') ctx.closeDialog();
      else if (a === 'toggle-value') { await REA.request(`/api/admin/catalogos/${id}`, { method: 'PATCH', body: { activo: el.dataset.activo === 'true' } }); await renderLists(); ctx.toast('Lista actualizada. Los formularios ya muestran el cambio.'); }
      else if (a === 'delete-value') { await REA.request(`/api/admin/catalogos/${id}`, { method: 'DELETE' }); await renderLists(); ctx.toast('Opción eliminada.'); }
      else if (a === 'export-csv') exportCsv();
      else if (a === 'clear-period') await renderReports({ desde: '', hasta: '' });
    } catch (error) { ctx.toast(error.message); } finally { el.disabled = false; }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!ctx || !(form.id?.startsWith('admin-') || form.matches('.admin-add-value'))) return;
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    const errorEl = form.querySelector('[data-admin-form-error]'); if (errorEl) errorEl.hidden = true;
    try {
      const body = Object.fromEntries(new FormData(form)), id = form.dataset.id;
      if (form.id === 'admin-report-form') { await renderReports({ desde: body.desde, hasta: body.hasta }); return; }
      if (form.id === 'admin-evaluation-form') {
        const tipos = [...form.querySelectorAll('input[name="tipos"]:checked')].map(input => input.value);
        await REA.request(`/api/admin/cuentas/${id}/evaluacion`, { method: 'POST', body: { ...body, tipos, subsanable: Boolean(form.subsanable?.checked) } });
        await renderFile(); ctx.toast('Evaluación registrada en el historial. Avisamos a la cuenta.'); return;
      }
      if (form.id === 'admin-subsanation-form') { await REA.request(`/api/admin/cuentas/${id}/subsanacion`, { method: 'POST', body }); ctx.closeDialog(); await renderFile(); ctx.toast('Nueva evaluación habilitada. Avisamos a la cuenta.'); return; }
      if (form.id === 'admin-account-form') {
        const a = account(id) || file?.cuenta, donor = a.rol === 'donante';
        const perfil = { direccion: body.direccion, referencia: body.referencia, provincia: body.provincia, distrito: body.distrito, departamento: 'Puno', dni_representante: body.dni_representante || undefined, responsable: body.nombre, latitud: a.perfil?.latitud, longitud: a.perfil?.longitud, ubicacion_confirmada: true };
        Object.assign(perfil, donor ? { nombre_establecimiento: body.entidad, ruc: body.ruc } : { nombre: body.entidad, tipo_organizacion: body.tipo_organizacion, numero_beneficiarios: Number(body.numero_beneficiarios) });
        await REA.request(`/api/admin/cuentas/${id}/datos`, { method: 'PATCH', body: { nombre: body.nombre, telefono: body.telefono, correo: body.correo.trim().toLowerCase(), perfil } });
        ctx.closeDialog(); if (ctx.current() === 'expediente') await renderFile(); else await renderAccounts(); ctx.toast('Datos actualizados. Avisamos a la cuenta.'); return;
      }
      if (form.id === 'admin-donation-form') {
        await REA.request(`/api/admin/donaciones/${id}`, { method: 'PATCH', body: { ...body, cantidad: Number(String(body.cantidad).replace(',', '.')), fecha_limite_recojo: new Date(`${body.fecha_limite_recojo}:00-05:00`).toISOString() } });
        await afterRecordChange('Donación actualizada. Avisamos al donante y a las beneficiarias.'); return;
      }
      if (form.id === 'admin-cancel-donation-form') { await REA.request(`/api/admin/donaciones/${id}/cancelar`, { method: 'POST', body }); await afterRecordChange('Donación cancelada. Avisamos a las personas afectadas.'); return; }
      if (form.id === 'admin-cancel-request-form') { await REA.request(`/api/admin/solicitudes/${id}/cancelar`, { method: 'POST', body }); await afterRecordChange('Solicitud cancelada. Avisamos al donante y a la beneficiaria.'); return; }
      if (form.matches('.admin-add-value')) { await REA.request('/api/admin/catalogos', { method: 'POST', body: { tipo: form.dataset.tipo, valor: body.valor } }); await renderLists(); ctx.toast(`Se agregó "${body.valor}".`); return; }
      const routes = { 'admin-verify-form': ['POST', `/api/admin/cuentas/${id}/verificacion`, 'Verificación guardada. Avisamos a la cuenta.'], 'admin-suspend-form': ['POST', `/api/admin/cuentas/${id}/suspender`, 'Cuenta desactivada. Se conservan sus datos y avisamos a las personas afectadas.'], 'admin-reactivate-form': ['POST', `/api/admin/cuentas/${id}/reactivar`, 'Cuenta reactivada.'], 'admin-delete-form': ['DELETE', `/api/admin/cuentas/${id}`, 'Cuenta eliminada.'] };
      const [method, url, message] = routes[form.id];
      await REA.request(url, { method, body });
      ctx.closeDialog(); if (ctx.current() === 'expediente' && form.id !== 'admin-delete-form') await renderFile(); else await renderAccounts(); ctx.toast(message);
    } catch (error) { if (errorEl) { errorEl.textContent = error.message; errorEl.hidden = false; errorEl.focus(); } else ctx.toast(error.message); }
    finally { submit.disabled = false; }
  });
  // Documentos de respaldo: se suben en cuanto se eligen y quedan listos para la próxima evaluación.
  document.addEventListener('change', async event => {
    if (!ctx || !event.target.matches('[data-admin-documents]')) return;
    const input = event.target, files = [...input.files];
    try {
      for (const f of files) await REA.uploadFile(`/api/admin/cuentas/${fileAccountId}/documentos`, f);
      await renderFile(); ctx.toast(files.length === 1 ? 'Documento adjuntado.' : `${files.length} documentos adjuntados.`);
    } catch (error) { ctx.toast(error.message); await renderFile(); }
  });
  window.REAAdmin = { configure(value) { ctx = value; }, render, views: ['cuentas', 'expediente', 'listas', 'reportes'] };
})();
