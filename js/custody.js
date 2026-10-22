/* Seguimiento registrado en MySQL (entregas, seguimientos e incidencias). Las ubicaciones son declaradas; no hay GPS ni sensores en vivo. */
(() => {
  let ctx,records=[],selected=null,currentView='seguimiento',filter='todos',plan=null,loadSequence=0;
  const $=s=>ctx.main.querySelector(s);
  const names={preparacion:'En preparación',listo:'Listo para recojo',recogido:'Recojo registrado',en_transito:'En traslado',entregado:'Entrega registrada',confirmado:'Recepción confirmada'};
  const stepNames={aceptacion:'Acuerdo de donación',listo:'Preparación terminada',recogido:'Transferencia de custodia',en_transito:'Salida a traslado',entregado:'Entrega en destino',confirmado:'Recepción confirmada',observacion:'Observación de custodia'};
  const conditionNames={sin_verificar:'Sin inspección declarada',sin_novedad:'Sin novedades declaradas',requiere_revision:'Requiere revisión',no_conforme:'Condición no conforme'};
  const stages=['preparacion','listo','recogido','en_transito','entregado','confirmado'];
  const next={preparacion:'listo',listo:'recogido',recogido:'en_transito',en_transito:'entregado',entregado:'confirmado'};
  const roleStages={donante:['listo','recogido'],organizacion:['recogido','en_transito','entregado','confirmado'],administrador:['listo','recogido','en_transito','entregado','confirmado']};
  const e=v=>ctx.escape(v),n=v=>ctx.number(v),dt=v=>ctx.date(v);
  const button=(text,action,id='',cls='btn-secondary')=>`<button type="button" class="btn ${cls}" data-custody-action="${action}" ${id!==''?`data-id="${Number(id)}"`:''}>${text}</button>`;
  const badge=(status,cls='')=>`<span class="custody-badge ${cls||status}"><span></span>${e(names[status]||status)}</span>`;
  function statusTone(t){
    if(t.incidencias_criticas>0||t.ultimo_hito?.condicion_declarada==='no_conforme'||(t.fecha_limite_aprovechamiento_declarada&&Date.parse(t.fecha_limite_aprovechamiento_declarada)<=Date.now()))return 'rojo';
    return t.plan_actual?.evaluacion?.estado_viabilidad||t.ultima_evaluacion?.detalle?.estado_viabilidad||'gris';
  }
  function age(value){const mins=Math.max(0,Math.floor((Date.now()-Date.parse(value))/60000));return mins<60?`hace ${mins} min`:`hace ${Math.floor(mins/60)} h ${mins%60} min`;}
  async function render(view='seguimiento'){
    currentView=view;
    const response=await REA.request('/api/seguimiento');records=response.data;
    if(view==='incidencias'){await renderIncidents();return;}
    ctx.setContent(`${ctx.heading('Cada entrega tiene una historia.','Sigue el recorrido, compara los tiempos y registra cada transferencia de custodia.',button('<i class="fa-solid fa-rotate"></i> Actualizar','refresh'))}
      <div class="custody-overview"><article><span class="custody-overview-icon"><i class="fa-solid fa-truck-fast"></i></span><div><strong>${records.filter(t=>!['confirmado'].includes(t.estado)&&t.donacion_estado!=='cancelada').length}</strong><span>entregas en coordinación</span></div></article><article><span class="custody-overview-icon amber"><i class="fa-solid fa-shield-heart"></i></span><div><strong>${records.reduce((sum,t)=>sum+Number(t.incidencias_abiertas),0)}</strong><span>incidencias por revisar</span></div></article><article><span class="custody-overview-icon"><i class="fa-solid fa-circle-check"></i></span><div><strong>${records.filter(t=>t.estado==='confirmado').length}</strong><span>recepciones confirmadas</span></div></article></div>
      <div class="custody-layout"><aside class="custody-selector mvp-panel"><div class="custody-selector-head"><span class="section-kicker">TUS RECORRIDOS</span><h2>Del origen al destino</h2></div><label class="custody-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-custody-search aria-label="Buscar seguimiento" placeholder="Alimento, ciudad o destino"></label><div data-custody-list></div><p class="custody-small-note"><i class="fa-solid fa-hand-holding-heart"></i> Cada hito conserva responsable y hora del servidor.</p></aside><div class="custody-detail" data-custody-detail><div class="app-loading"><span class="loading-spinner"></span><p>Consultando la cadena de custodia…</p></div></div></div>`, 'Seguimiento y cadena de custodia');
    renderList();
    const selectedId=records.find(t=>t.id_seguimiento===selected?.id_seguimiento)?.id_seguimiento||records.find(t=>t.estado==='en_transito')?.id_seguimiento||records[0]?.id_seguimiento;
    if(selectedId)await select(selectedId);
    else $('[data-custody-detail]').innerHTML='<div class="mvp-panel mvp-empty"><span class="empty-icon"><i class="fa-solid fa-route"></i></span><h2>Tu próxima ruta empieza con un acuerdo.</h2><p>Al aceptar una solicitud se habilita automáticamente su cadena de custodia. Publica una donación o revisa tus solicitudes.</p></div>';
  }
  function renderList(q=''){
    const container=$('[data-custody-list]');if(!container)return;
    const visible=records.filter(t=>`${t.alimento} ${t.origen.nombre} ${t.destino.nombre} ${t.destino.distrito}`.toLocaleLowerCase('es').includes(q.toLocaleLowerCase('es')));
    container.innerHTML=visible.map(t=>`<button type="button" class="custody-choice ${t.id_seguimiento===selected?.id_seguimiento?'selected':''}" data-custody-action="select" data-id="${t.id_seguimiento}" aria-pressed="${t.id_seguimiento===selected?.id_seguimiento}"><img src="${REAPresentation.photo(t)}" alt="" loading="lazy"><span class="custody-choice-copy"><small>TRAZABILIDAD #${t.id_seguimiento}</small><strong>${e(t.alimento)}</strong><span>${e(t.origen.distrito)} <i class="fa-solid fa-arrow-right"></i> ${e(t.destino.distrito)}</span><em><span class="custody-status-dot ${statusTone(t)}"></span>${e(names[t.estado])}${t.incidencias_abiertas>0?` · ${t.incidencias_abiertas} alerta(s)`:''}</em></span></button>`).join('')||'<p class="small-muted">No hay recorridos que coincidan.</p>';
  }
  async function select(id){
    const seq=++loadSequence;
    const response=await REA.request(`/api/seguimiento/${id}`);
    if(seq!==loadSequence||currentView!=='seguimiento'||!$('[data-custody-detail]'))return;
    selected=response.data;plan=selected.plan_actual||null;
    const recordIndex=records.findIndex(t=>t.id_seguimiento===selected.id_seguimiento);if(recordIndex>=0)records[recordIndex]=selected;
    renderList($('[data-custody-search]')?.value||'');renderSelected();
    if(!plan?.ruta || Date.now()-Date.parse(plan.ruta.fecha_calculo)>3600000){
      try{await calculate(seq);}catch(error){if(seq===loadSequence)routeError(error);}
    }
  }
  function renderSelected(){
    REAMaps.dispose($('[data-custody-detail]'));
    const t=selected,index=stages.indexOf(t.estado),last=t.ultimo_hito;
    const canceled=t.donacion_estado==='cancelada'||t.solicitud_estado!=='aceptada';
    const canAdvance=!canceled&&next[t.estado]&&roleStages[ctx.role].includes(next[t.estado]);
    const destination=t.destino;
    const noCold=t.requiere_cadena_frio;
    $('[data-custody-detail]').innerHTML=`<article class="mvp-panel custody-shipment"><div class="custody-shipment-heading"><div><span class="section-kicker">DONACIÓN #${t.id_donacion} · SOLICITUD #${t.id_solicitud}</span><h2>${e(t.alimento)}</h2><p>${n(t.cantidad)} ${e(t.unidad)} · ${e(REAPresentation.profiles[t.perfil_alimento]||'Alimento declarado')}</p></div>${badge(canceled?'Operación cancelada':t.estado,canceled?'cancelada':'')}</div>
      <div class="custody-stepper" aria-label="Etapas de la cadena de custodia">${stages.map((s,i)=>`<div class="${i<index?'done':i===index?'current':''}"><span>${i<index?'<i class="fa-solid fa-check"></i>':i+1}</span><strong>${e(({preparacion:'Preparación',listo:'Listo',recogido:'Recojo',en_transito:'Traslado',entregado:'Entrega',confirmado:'Confirmación'})[s])}</strong></div>`).join('')}</div>
      <div class="custody-two-addresses"><div><span class="address-letter origin">A</span><div><small>ESTABLECIMIENTO DONANTE</small><strong>${e(t.origen.nombre)}</strong><p>${e(t.origen.direccion)}</p></div></div><span class="address-connector"><i class="fa-solid fa-arrow-right-long"></i></span><div><span class="address-letter destination">B</span><div><small>ORGANIZACIÓN RECEPTORA</small><strong>${e(destination.nombre)}</strong><p>${e(destination.direccion)}</p></div></div></div>
      <div class="map-surface custody-map" id="custody-map"><div class="map-placeholder"><i class="fa-solid fa-route"></i><strong>Consultando el recorrido por carretera</strong></div></div><div class="custody-map-footer"><span data-custody-provider>La ruta se obtiene de un proveedor externo.</span><span><i class="fa-solid fa-location-crosshairs"></i> Sin GPS en vivo</span></div>
      <form id="custody-route-form" class="custody-planning"><div class="custody-planning-title"><span class="section-kicker">ANTICÍPATE A LOS IMPREVISTOS</span><h3>Tiempo de ruta y escenario de tráfico</h3><p>La demora se suma a la estimación del proveedor; no es tráfico medido.</p></div><div class="form-grid"><label>Escenario de tráfico<select class="form-control" name="demora_trafico_min"><option value="0">Ruta base · +0 min</option><option value="10">Leve · +10 min</option><option value="25">Medio · +25 min</option><option value="45">Alto · +45 min</option><option value="90">Severo · +90 min</option><option value="180">Demora extrema · +180 min</option></select></label><label>Margen de seguridad logístico (min)<input class="form-control" name="margen_seguridad_min" type="number" min="0" max="1440" value="15" required></label><label>Preparación pendiente (min)<input class="form-control" name="preparacion_min" type="number" min="0" max="1440" value="${index>=2?0:10}" required ${index>=2?'readonly':''}></label><label>Recojo pendiente (min)<input class="form-control" name="recojo_min" type="number" min="0" max="1440" value="${index>=2?0:10}" required ${index>=2?'readonly':''}></label></div><input type="hidden" name="entrega_min" value="5">${noCold?`<label class="check-row"><input type="checkbox" name="dispone_cadena_frio" ${t.dispone_cadena_frio?'checked':''}><span>Se declaran medios para conservar la cadena de frío. No equivale a medición.</span></label>`:''}<button class="btn btn-primary" type="submit"><i class="fa-solid fa-route"></i> Actualizar ruta y semáforo</button><div class="mvp-message error" data-custody-route-error tabindex="-1" hidden></div></form>
      <div data-custody-comparison></div><div data-custody-evaluation>${ctx.renderEvaluation(null)}</div></article>
      <div class="custody-below-grid"><article class="mvp-panel custody-condition"><span class="section-kicker">CONDICIONES DEL LOTE</span><h2>Tiempo y conservación</h2><img src="${REAPresentation.photo(t)}" alt="Fotografía referencial de ${e(t.alimento)}"><span class="photo-referential-label">Imagen referencial · no acredita el lote</span><dl><div><dt>Límite de aprovechamiento declarado</dt><dd>${dt(t.fecha_limite_aprovechamiento_declarada)}</dd></div><div><dt>Conservación informada por el donante</dt><dd>${e(t.conservacion_declarada)}</dd></div><div><dt>Condición del último registro</dt><dd>${e(conditionNames[last?.condicion_declarada]||conditionNames.sin_verificar)}</dd></div><div><dt>Última temperatura registrada</dt><dd>${last?.temperatura_c!=null?`${n(last.temperatura_c)} °C · lectura declarada`:'Sin lectura documentada'}</dd></div><div><dt>Custodio registrado</dt><dd>${e(t.custodio_actual)}</dd></div><div><dt>Último lugar declarado</dt><dd>${e(last?.lugar||t.origen.direccion)}<small>${dt(last?.fecha_evento||t.fecha_actualizacion)} · ${age(last?.fecha_evento||t.fecha_actualizacion)}</small></dd></div></dl><p class="custody-small-note"><i class="fa-solid fa-circle-info"></i> El plazo depende del lote, elaboración y conservación declarados. El semáforo no determina si es comestible ni sustituye una revisión sanitaria.</p></article>
      <article class="mvp-panel custody-history"><div class="panel-heading"><div><span class="section-kicker">TRAZABILIDAD CON RESPONSABLES</span><h2>Cadena de custodia</h2></div><span class="history-total">${t.hitos.length} hitos</span></div><div class="custody-current-owner"><i class="fa-solid fa-user-shield"></i><span>Custodia registrada<strong>${e(t.custodio_actual)}</strong></span></div><ol class="custody-timeline">${t.hitos.map(h=>`<li><span class="timeline-node"><i class="fa-solid ${h.tipo==='recogido'?'fa-handshake':h.tipo==='en_transito'?'fa-truck-fast':h.tipo==='confirmado'?'fa-check-double':'fa-check'}"></i></span><div><small>${dt(h.fecha_evento)}</small><h3>${e(stepNames[h.tipo])}</h3><p class="timeline-author">${e(h.actor_nombre)} · ${e(h.actor_rol)}</p>${h.responsable_entrega||h.responsable_recibe?`<p class="timeline-transfer"><i class="fa-solid fa-arrow-right-arrow-left"></i> ${e(h.responsable_entrega||'No indicado')} → ${e(h.responsable_recibe||'No indicado')}</p>`:''}<p>${e(h.observacion)}</p><span class="timeline-place"><i class="fa-solid fa-location-dot"></i> ${e(h.lugar)}</span><span class="timeline-condition ${h.condicion_declarada}">${e(conditionNames[h.condicion_declarada])}${h.temperatura_c!=null?` · ${n(h.temperatura_c)} °C declarados`:''}</span>${h.es_demostracion?'<em class="timeline-demo">Escenario académico de demostración</em>':''}</div></li>`).join('')}</ol>
      <div class="custody-event-actions">${canAdvance?button(`<i class="fa-solid fa-plus"></i> ${e(stepNames[next[t.estado]])}`,'event',t.id_seguimiento,'btn-primary'):!canceled&&t.estado!=='confirmado'?`<p class="small-muted">El siguiente hito corresponde a ${t.estado==='preparacion'?'la preparación del donante':'la organización receptora o administración'}.</p>`:''}${!canceled&&t.estado!=='confirmado'?button('Registrar observación','observation',t.id_seguimiento):''}${button('<i class="fa-solid fa-triangle-exclamation"></i> Reportar incidencia','incident',t.id_seguimiento,'btn-danger-outline')}</div><p class="custody-small-note">Registros manuales e inmutables. Una corrección se añade como observación; no se reescribe el historial.</p></article></div>
      <article class="mvp-panel custody-alerts"><div class="panel-heading"><div><span class="section-kicker">ATENCIÓN Y SEGUIMIENTO</span><h2>Incidencias de esta entrega</h2></div>${button('Ver incidencias','incidents')}</div>${t.incidencias.length?t.incidencias.map(incidentCard).join(''):'<div class="custody-no-alert"><i class="fa-solid fa-shield-heart"></i><span>No hay incidencias registradas para esta entrega.</span></div>'}</article>`;
    restorePlanning(t.ultima_evaluacion?.planificacion);
    const photoLabel=$('.custody-condition .photo-referential-label');
    if(t.fotos?.length&&photoLabel){photoLabel.textContent='Fotografía compartida por el donante · requiere revisión del lote';photoLabel.previousElementSibling.alt=`Fotografía compartida por el donante de ${t.alimento}`;}
    if(plan)displayPlan(plan);
  }
  function restorePlanning(settings){
    const form=$('#custody-route-form');if(!form||!settings)return;
    for(const key of ['preparacion_min','recojo_min','entrega_min','margen_seguridad_min','demora_trafico_min']){
      const field=form.elements.namedItem(key);if(!field||settings[key]==null)continue;
      if(field.tagName==='SELECT'&&![...field.options].some(option=>option.value===String(settings[key]))){const option=document.createElement('option');option.value=String(settings[key]);option.textContent=`Personalizado · +${n(settings[key])} min`;field.append(option);}
      field.value=String(settings[key]);
    }
    if(form.dispone_cadena_frio&&typeof settings.dispone_cadena_frio==='boolean')form.dispone_cadena_frio.checked=settings.dispone_cadena_frio;
  }
  function displayPlan(result){
    plan=result;
    selected.plan_actual=result;
    $('[data-custody-evaluation]').innerHTML=ctx.renderEvaluation(result);
    $('[data-custody-comparison]').innerHTML=REAPresentation.journey(result,{origen:selected.origen,destino:selected.destino})+REAPresentation.comparison(result);
    restorePlanning(result.evaluacion);
    renderList($('[data-custody-search]')?.value||'');
    if(result.ruta?.geometry)REAMaps.showRoute($('#custody-map'),{...result.ruta,origen:{...result.ruta.origen,...selected.origen},destino:{...result.ruta.destino,...selected.destino},estado_viabilidad:result.evaluacion?.estado_viabilidad});
    $('[data-custody-provider]').textContent=result.ruta?`${result.ruta.proveedor} · cálculo ${dt(result.ruta.fecha_calculo)} · recorrido planificado completo`:'Sin ruta disponible';
    const e=result.evaluacion;
    if(e?.llegada_estimada&&!['entregado','confirmado'].includes(selected.estado)){const eta=document.createElement('p');eta.className='custody-eta';eta.innerHTML=`<i class="fa-regular fa-clock"></i><span>Fin de coordinación estimado, con margen: <strong>${dt(e.llegada_estimada)}</strong></span>`;$('[data-custody-comparison]').append(eta);}
    const stamp=document.createElement('p');stamp.className='custody-refresh-stamp';stamp.textContent=`Evaluación temporal: ${dt(e?.fecha_calculo)} · se actualiza cada minuto mientras esta pantalla esté visible.`;$('[data-custody-evaluation]').append(stamp);
  }
  function routeError(error){const el=$('[data-custody-route-error]');if(el){el.textContent=error.message;el.hidden=false;}if(!plan?.ruta){$('[data-custody-provider]').textContent='Proveedor no disponible. No se muestran tiempos inventados.';$('#custody-map').innerHTML='<div class="map-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><strong>No se pudo consultar la ruta</strong><span>Puedes volver a intentarlo.</span></div>';}}
  async function calculate(seq=loadSequence){
    const form=$('#custody-route-form');if(!form)return;
    const t=selected;
    const body=Object.fromEntries(['preparacion_min','recojo_min','entrega_min','margen_seguridad_min','demora_trafico_min'].map(k=>[k,Number(form.elements.namedItem(k).value)]));
    if(form.dispone_cadena_frio)body.dispone_cadena_frio=form.dispone_cadena_frio.checked;
    const result=await REA.request(`/api/seguimiento/${t.id_seguimiento}/evaluacion`,{method:'POST',body});
    if(seq===loadSequence&&selected===t&&$('[data-custody-evaluation]'))displayPlan(result.data);
  }
  function eventDialog(observation=false){
    const t=selected,type=observation?'observacion':next[t.estado];
    const transfer=['recogido','entregado','confirmado'].includes(type);
    const destination=['entregado','confirmado'].includes(type);
    ctx.openDialog(stepNames[type],`<form id="custody-event-form" data-type="${type}" data-id="${t.id_seguimiento}" data-version="${t.version}"><p class="dialog-intro">El hito se guardará con tu usuario y la hora real del servidor. Registra únicamente lo que hayas comprobado; una lectura manual no equivale a un sensor continuo.</p><div class="form-grid">${transfer?`<label>Responsable que entrega<input class="form-control" name="responsable_entrega" value="${e(t.custodio_actual)}" required maxlength="150"></label><label>Responsable que recibe<input class="form-control" name="responsable_recibe" value="${e(destination?t.destino.nombre:t.responsable_recojo)}" required maxlength="150"></label>`:''}<label class="full">Lugar del hito<input class="form-control" name="lugar" value="${e(destination?t.destino.direccion:t.ultimo_hito?.lugar||t.origen.direccion)}" required maxlength="300"></label><label>Condición observada declarada<select class="form-control" name="condicion_declarada" required><option value="sin_verificar">No he realizado inspección</option><option value="sin_novedad">Sin novedades observadas</option><option value="requiere_revision">Requiere revisión</option><option value="no_conforme">No conforme · crea incidencia crítica</option></select></label><label>Temperatura medida (°C, opcional)<input class="form-control" name="temperatura_c" type="number" step="0.1" min="-80" max="120" placeholder="Solo si dispones de lectura"></label>${t.requiere_cadena_frio?'<label class="full">Conservación de frío declarada<select class="form-control" name="conserva_frio"><option value="">No verificada</option><option value="true">Se declaran medios de conservación</option><option value="false">No se dispone de medios</option></select></label>':''}<label class="full">Observación y evidencia declarada<textarea class="form-control" name="observacion" minlength="5" maxlength="2500" required placeholder="Describe envase, condición, coordinación y lo observado"></textarea></label></div>${type==='confirmado'?'<p class="mvp-message warning">Confirmas la recepción registrada, no la aptitud de consumo. Las incidencias críticas abiertas impiden confirmar.</p>':''}<div class="mvp-message error" data-custody-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver','close')}<button class="btn btn-primary" type="submit">Guardar hito de custodia</button></div></form>`);
  }
  function incidentDialog(id){
    const options=records.map(t=>`<option value="${t.id_seguimiento}" ${Number(id)===t.id_seguimiento?'selected':''}>#${t.id_seguimiento} · ${e(t.alimento)}</option>`).join('');
    ctx.openDialog('Reportar incidencia',`<form id="custody-incident-form"><p class="dialog-intro">Describe el problema para los participantes y administración. Una incidencia alta abierta activa la alerta roja del seguimiento.</p><label>Entrega vinculada<select class="form-control" name="id_seguimiento" required>${options}</select></label><div class="form-grid"><label>Tipo<select class="form-control" name="tipo"><option value="demora">Demora en coordinación</option><option value="temperatura">Conservación / temperatura</option><option value="envase">Envase / integridad</option><option value="calidad">Condición del alimento</option><option value="otro">Otro</option></select></label><label>Severidad<select class="form-control" name="severidad"><option value="media">Media · revisar</option><option value="alta">Alta · detener y revisar</option><option value="baja">Baja · seguimiento</option></select></label><label class="full">Título<input class="form-control" name="titulo" minlength="5" maxlength="180" required></label><label class="full">Descripción<textarea class="form-control" name="descripcion" minlength="10" maxlength="2500" required></textarea></label></div><div class="mvp-message error" data-custody-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver','close')}<button class="btn btn-primary" type="submit">Guardar incidencia</button></div></form>`);
  }
  function incidentCard(i){
    return `<article class="custody-incident-card severity-${e(i.severidad)}"><div class="incident-icon"><i class="fa-solid ${i.estado==='resuelta'?'fa-circle-check':'fa-triangle-exclamation'}"></i></div><div class="incident-content"><div class="incident-title-row"><span class="section-kicker">INCIDENCIA #${i.id_incidencia} · ${e(i.tipo)} · ${e(i.severidad)}</span><span class="custody-badge ${i.estado}">${i.estado==='resuelta'?'Resuelta':'Abierta'}</span></div><h3>${e(i.titulo)}</h3>${i.alimento?`<strong class="incident-food">${e(i.alimento)}</strong>`:''}<p>${e(i.descripcion)}</p><small>${dt(i.fecha_creacion)} · ${e(i.actor_nombre)}</small>${i.resolucion?`<div class="incident-resolution"><strong>Resolución registrada</strong><p>${e(i.resolucion)}</p><small>${e(i.resuelto_por)} · ${dt(i.fecha_resolucion)}</small></div>`:''}<div class="incident-actions">${currentView==='incidencias'?button('Abrir seguimiento','open-tracking',i.id_seguimiento):''}${i.estado==='abierta'&&ctx.role==='administrador'?button('Registrar resolución','resolve',i.id_incidencia,'btn-primary'):''}</div></div></article>`;
  }
  async function renderIncidents(){
    const response=await REA.request('/api/incidencias');const list=response.data;
    ctx.setContent(`${ctx.heading('Lo importante no pasa desapercibido.','Incidencias vinculadas a cada entrega, con responsable, prioridad y resolución.',records.length?button('<i class="fa-solid fa-plus"></i> Reportar incidencia','incident','','btn-primary'):'')}
      <div class="custody-overview"><article><span class="custody-overview-icon amber"><i class="fa-solid fa-triangle-exclamation"></i></span><div><strong>${list.filter(i=>i.estado==='abierta').length}</strong><span>incidencias abiertas</span></div></article><article><span class="custody-overview-icon red"><i class="fa-solid fa-shield"></i></span><div><strong>${list.filter(i=>i.estado==='abierta'&&i.severidad==='alta').length}</strong><span>prioridad alta</span></div></article><article><span class="custody-overview-icon"><i class="fa-solid fa-check-double"></i></span><div><strong>${list.filter(i=>i.estado==='resuelta').length}</strong><span>resoluciones registradas</span></div></article></div>
      <section class="mvp-panel incident-board"><div class="mvp-request-tabs"><button type="button" class="active" data-incident-filter="todos">Todas</button><button type="button" data-incident-filter="abierta">Abiertas</button><button type="button" data-incident-filter="resuelta">Resueltas</button></div><div data-incident-list></div><p class="custody-small-note">Resolver una incidencia no certifica inocuidad. Se conserva la descripción original y la decisión administrativa.</p></section>`,'Incidencias y revisión');
    const paint=()=>{$('[data-incident-list]').innerHTML=list.filter(i=>filter==='todos'||i.estado===filter).map(incidentCard).join('')||'<div class="custody-no-alert"><i class="fa-solid fa-shield-heart"></i><span>No hay incidencias en esta vista.</span></div>';};filter='todos';paint();
    ctx.main.querySelectorAll('[data-incident-filter]').forEach(el=>el.addEventListener('click',()=>{filter=el.dataset.incidentFilter;ctx.main.querySelectorAll('[data-incident-filter]').forEach(b=>b.classList.toggle('active',b===el));paint();}));
  }
  document.addEventListener('input',event=>{if(ctx&&event.target.matches('[data-custody-search]'))renderList(event.target.value);});
  document.addEventListener('click',async event=>{
    const el=event.target.closest('[data-custody-action]');if(!el||!ctx)return;
    const a=el.dataset.custodyAction;el.disabled=true;
    try{
      if(a==='select')await select(Number(el.dataset.id));
      else if(a==='refresh')await render(currentView);
      else if(a==='event')eventDialog();
      else if(a==='observation')eventDialog(true);
      else if(a==='incident')incidentDialog(el.dataset.id||selected?.id_seguimiento||records[0]?.id_seguimiento);
      else if(a==='close')ctx.closeDialog();
      else if(a==='incidents')ctx.main.closest('body')?.querySelector('[data-view="incidencias"]')?.click();
      else if(a==='open-tracking'){const id=Number(el.dataset.id);selected=records.find(t=>t.id_seguimiento===id);ctx.main.closest('body')?.querySelector('[data-view="seguimiento"]')?.click();}
      else if(a==='resolve')ctx.openDialog('Registrar resolución',`<form id="custody-resolution-form" data-id="${Number(el.dataset.id)}"><p class="dialog-intro">Describe la verificación, la medida tomada y el responsable. El registro original se conservará.</p><label>Resolución<textarea class="form-control" name="resolucion" required minlength="10" maxlength="2500"></textarea></label><div class="mvp-message error" data-custody-form-error tabindex="-1" hidden></div><div class="dialog-actions">${button('Volver','close')}<button class="btn btn-primary" type="submit">Guardar resolución</button></div></form>`);
    }catch(error){ctx.toast(error.message);}finally{el.disabled=false;}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!ctx||!['custody-route-form','custody-event-form','custody-incident-form','custody-resolution-form'].includes(form.id))return;
    event.preventDefault();if(!form.reportValidity())return;
    const submit=form.querySelector('[type="submit"]'),original=submit.innerHTML;submit.disabled=true;submit.innerHTML='<span class="loading-spinner small"></span> Guardando…';
    const errorEl=form.querySelector('[data-custody-form-error],[data-custody-route-error]');if(errorEl)errorEl.hidden=true;
    try{
      if(form.id==='custody-route-form'){await calculate();return;}
      const body=Object.fromEntries(new FormData(form));
      if(form.id==='custody-event-form'){
        body.tipo=form.dataset.type;body.version=Number(form.dataset.version);body.temperatura_c=body.temperatura_c===''?null:Number(body.temperatura_c);
        body.conserva_frio=body.conserva_frio==null||body.conserva_frio===''?null:body.conserva_frio==='true';
        await REA.request(`/api/seguimiento/${Number(form.dataset.id)}/hitos`,{method:'POST',body});ctx.closeDialog();await select(Number(form.dataset.id));ctx.toast('Hito guardado con responsable y hora del servidor.');
      } else if(form.id==='custody-incident-form'){
        await REA.request(`/api/seguimiento/${Number(body.id_seguimiento)}/incidencias`,{method:'POST',body});ctx.closeDialog();await render(currentView);ctx.toast('Incidencia registrada y visible para administración.');
      }else{
        await REA.request(`/api/incidencias/${Number(form.dataset.id)}/resolver`,{method:'POST',body});ctx.closeDialog();await render(currentView);ctx.toast('Resolución conservada en el historial.');
      }
    }catch(error){if(form.id==='custody-route-form')routeError(error);else if(errorEl){errorEl.textContent=error.message;errorEl.hidden=false;errorEl.focus();}}
    finally{submit.disabled=false;submit.innerHTML=original;}
  });
  window.REACustody={configure(value){ctx=value;},render,setTarget(id){selected={id_seguimiento:Number(id)};},open(id){selected={id_seguimiento:Number(id)};document.querySelector('.sidebar-nav [data-view="seguimiento"]')?.click();}};
  setInterval(()=>{if(ctx&&!document.hidden&&currentView==='seguimiento'&&selected&&$('#custody-route-form')&&!document.querySelector('#app-dialog[open]')&&!$('#custody-route-form button[type="submit"]').disabled)void calculate().catch(routeError);},60000);
})();
