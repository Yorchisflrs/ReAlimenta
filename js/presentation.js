/* Fotografías locales y planes reales; nunca se fabrican distancias ni plazos sanitarios. */
(() => {
  const keys=['pan','fruta','verduras','yogur','arroz','sopa','salsa','galletas','leche','ensalada'];
  const profiles={general:'Condiciones específicas del lote',panaderia:'Panadería',frutas:'Fruta entera',hortalizas:'Hortalizas',preparado:'Alimento preparado',refrigerado:'Producto refrigerado',seco:'Producto seco envasado'};
  let ctx={};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const num=value=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:1}).format(Number(value||0));
  function key(d){
    if(keys.includes(d.imagen_clave))return d.imagen_clave;
    const s=`${d.alimento||''} ${d.categoria||''}`.toLocaleLowerCase('es');
    return /galleta/.test(s)?'galletas':/pan/.test(s)?'pan':/yogu/.test(s)?'yogur':/leche|lácte/.test(s)?'leche':/arroz|abarrote/.test(s)?'arroz':/salsa|tomate/.test(s)?'salsa':/ensalada/.test(s)?'ensalada':/crema|sopa|preparad/.test(s)?'sopa':/verd|hortal/.test(s)?'verduras':'fruta';
  }
  function photo(d){return `assets/images/alimentos/${key(d)}.jpg`;}
  function decorate(root,state){
    root.querySelectorAll('.mvp-donation-card').forEach(card=>{
      if(card.dataset.photographed)return;
      const id=card.querySelector('[data-action="detail"]')?.dataset.id;
      const d=state.donations.find(d=>String(d.id_donacion)===id);if(!d)return;
      card.dataset.photographed='true';
      const visual=card.querySelector('.food-visual');visual.classList.add('has-photo');
      const img=document.createElement('img');img.src=photo(d);img.alt=`Fotografía referencial de ${d.alimento}`;img.loading='lazy';img.decoding='async';visual.prepend(img);
      visual.querySelector(':scope > i')?.remove();
      const reference=document.createElement('span');reference.className='photo-reference';reference.textContent='Foto referencial';visual.append(reference);
      const body=card.querySelector('.donation-card-body');
      if(d.cadena_custodia){
        const status=card.querySelector('.card-title-row .mvp-badge');
        const titles={preparacion:'En preparación',listo:'Listo para recojo',recogido:'Recojo registrado',en_transito:'En traslado',entregado:'Entrega registrada',confirmado:'Recepción confirmada'};
        if(status&&d.estado==='en_proceso')status.innerHTML=`<span></span>${titles[d.cadena_custodia.estado]||'Asignada'}`;
        const go=document.createElement('button');go.type='button';go.className='btn btn-secondary card-tracking-link';go.dataset.presentationTracking=d.cadena_custodia.id_seguimiento;go.innerHTML='<i class="fa-solid fa-truck-fast"></i> Abrir seguimiento';body.append(go);
      }
      const address=document.createElement('p');address.className='card-address';address.innerHTML=`<i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>${esc(d.direccion_recojo)}</span>`;
      body.querySelector('.donation-by').after(address);
      const plan=state.evaluations.get(String(d.id_donacion))||d.plan_ruta;
      const badge=card.querySelector('.mini-feasibility');
      if(plan?.ruta){
        const row=document.createElement('div');row.className='card-route-preview';
        row.innerHTML=`<div><i class="fa-solid fa-route"></i><strong>${num(plan.ruta.distancia_km)} km</strong><span>${num(plan.ruta.duracion_estimada_min)} min base</span></div><small>Hasta ${esc(plan.destino?.nombre||state.profile.nombre||'organización evaluada')} · sin tráfico en vivo</small>`;
        badge.before(row);
        const tone=plan.evaluacion.estado_viabilidad;
        badge.className=`mini-feasibility ${['verde','amarillo','rojo','gris'].includes(tone)?tone:'gris'}`;
        const words={verde:'Margen de tiempo suficiente',amarillo:'Margen reducido · revisar',rojo:'No viable · requiere revisión',gris:d.requiere_cadena_frio?'Confirma los medios de cadena de frío':'Faltan datos para evaluar'};
        badge.innerHTML=`<span></span>${words[tone]||words.gris}`;
      } else badge.innerHTML='<span></span>Abre la ruta para evaluar este traslado';
      const mini=document.createElement('small');mini.className='declared-deadline';mini.textContent='Tiempo hasta el límite declarado; no garantiza aptitud de consumo.';body.querySelector('.card-time').after(mini);
    });
  }
  function comparison(result){
    if(!result?.ruta)return '';
    const base=Number(result.ruta.duracion_estimada_min),extra=Number(result.evaluacion?.demora_trafico_min||0);
    return `<div class="traffic-comparison"><div><span><i class="fa-solid fa-road"></i> Ruta base</span><strong>${num(base)} <small>min</small></strong><p>Estimación del proveedor</p></div><div><span><i class="fa-solid fa-car-side"></i> Con demora elegida</span><strong>${num(base+extra)} <small>min</small></strong><p>Base + ${num(extra)} min de escenario</p></div><div><span><i class="fa-solid fa-shield-heart"></i> Margen logístico</span><strong>${num(result.evaluacion?.margen_seguridad_min)} <small>min</small></strong><p>Reserva adicional de planificación</p></div></div><p class="traffic-disclaimer">Los escenarios de congestión son supuestos manuales, no mediciones de tráfico en vivo. La duración real puede variar.</p>`;
  }
  async function routeForm(root,state){
    const form=root.querySelector('#route-form');if(!form||form.dataset.enhanced)return;
    form.dataset.enhanced='true';
    const extra=document.createElement('label');extra.className='full';extra.innerHTML='Escenario de tráfico<select class="form-control" name="demora_trafico_min"><option value="0">Ruta base · sin demora adicional</option><option value="10">Congestión leve · +10 min</option><option value="25">Congestión media · +25 min</option><option value="45">Congestión alta · +45 min</option><option value="90">Demora severa · +90 min</option><option value="180">Comparar con una demora de 3 horas</option></select>';
    form.querySelector('.form-grid').append(extra);
    const selected=state.selected;
    const description=root.querySelector('.detail-summary>p');if(description)description.textContent=description.textContent.replace(/^\[DEMO:(?:SEED|PRESENTACION):[A-Z_]+\]\s*/,'');
    const isOrg=state.user.rol==='organizacion';
    let destination=state.selectedRequest?.organizacion || (isOrg?state.profile:null);
    if(!isOrg&&!state.selectedRequest){
      const label=document.createElement('label');label.className='route-destination-field';label.innerHTML='Organización de destino<select class="form-control" name="id_organizacion" required><option value="">Cargando destinos…</option></select>';
      form.prepend(label);
      try{
        const response=await REA.request('/api/destinos');if(!root.contains(form))return;
        label.querySelector('select').innerHTML=response.data.map(o=>`<option value="${Number(o.id_organizacion)}" ${Number(o.id_organizacion)===Number(selected.plan_ruta?.id_organizacion)?'selected':''}>${esc(o.nombre)} · ${esc(o.distrito)}</option>`).join('');
        const refresh=()=>{const chosen=response.data.find(o=>Number(o.id_organizacion)===Number(form.id_organizacion.value));destination=chosen;const side=root.querySelector('.location-steps>div:last-child strong');if(side)side.textContent=chosen?`${chosen.nombre} · ${chosen.direccion}`:'Selecciona destino';};refresh();
        label.querySelector('select').addEventListener('change',()=>{refresh();root.querySelector('#route-evaluation').innerHTML=ctx.renderEvaluation(null);root.querySelector('[data-route-provider]').textContent='Destino cambiado: calcula la ruta para este nuevo destino.';REAMaps.dispose(root.querySelector('#delivery-map'));root.querySelector('#delivery-map').replaceChildren();});
      }catch(error){form.querySelector('[data-route-error]').textContent=error.message;form.querySelector('[data-route-error]').hidden=false;return;}
    }
    const dest=root.querySelector('.location-steps>div:last-child strong');if(dest&&destination)dest.textContent=`${destination.nombre} · ${destination.direccion}`;
    const hero=document.createElement('div');hero.className='detail-food-photo';hero.innerHTML=`<img src="${photo(selected)}" alt="Fotografía referencial del tipo de alimento"><span>Fotografía referencial · ${esc(profiles[selected.perfil_alimento]||profiles.general)}</span>`;
    root.querySelector('.detail-summary').prepend(hero);
    if(selected.plan_ruta&&(!state.selectedRequest||Number(state.selectedRequest.id_organizacion)===Number(selected.plan_ruta.id_organizacion))){ctx.displayRoute(selected.plan_ruta);}
    else if(isOrg||state.selectedRequest){
      try{
        const response=await REA.request(`/api/donaciones/${selected.id_donacion}/evaluacion`,{method:'POST',body:{preparacion_min:10,recojo_min:10,entrega_min:5,margen_seguridad_min:15,...(state.selectedRequest?{id_solicitud:state.selectedRequest.id_solicitud}:{})}});
        if(root.contains(form)&&state.selected===selected)ctx.displayRoute(response.data);
      }catch(error){if(root.contains(form)){const el=form.querySelector('[data-route-error]');el.textContent=error.message;el.hidden=false;}}
    }
  }
  function donationForm(root,state){
    const form=root.querySelector('#donation-form');if(!form||form.dataset.enhanced)return;
    form.dataset.enhanced='true';
    const d=form.dataset.id?state.selected:{};
    const image=document.createElement('label');image.innerHTML=`Fotografía referencial<select class="form-control" name="imagen_clave"><option value="">Según categoría del alimento</option>${keys.map(k=>`<option value="${k}" ${k===d?.imagen_clave?'selected':''}>${esc(({pan:'Pan artesanal',fruta:'Fruta variada',verduras:'Verduras',yogur:'Yogur',arroz:'Arroz seco',sopa:'Crema de verduras',salsa:'Tomates',galletas:'Galletas',leche:'Leche',ensalada:'Ensalada'})[k])}</option>`).join('')}</select>`;
    form.querySelector('.form-grid').append(image);
    const profile=document.createElement('label');profile.innerHTML=`Tipo de alimento<select class="form-control" name="perfil_alimento">${Object.entries(profiles).map(([k,v])=>`<option value="${k}" ${k===d?.perfil_alimento?'selected':''}>${esc(v)}</option>`).join('')}</select>`;image.after(profile);
    const availability=form.querySelector('[name="fecha_disponibilidad"]');
    const duration=document.createElement('label');duration.className='full';duration.innerHTML='Atajo opcional · plazo declarado desde disponibilidad (min)<input class="form-control" type="number" name="plazo_declarado_min" min="5" max="10080" placeholder="Ej. 60 si el responsable declara una hora"><small class="small-muted">No se asigna duración por categoría. Este atajo completa las fechas; usa un plazo validado para ese lote, su elaboración y conservación.</small>';
    form.querySelector('[name="fecha_limite_aprovechamiento_declarada"]').closest('label').after(duration);
    duration.querySelector('input').addEventListener('change',()=>{
      const min=Number(duration.querySelector('input').value);if(!min||!availability.value)return;
      const start=Date.parse(`${availability.value}:00-05:00`),limit=start+min*60000;
      const local=value=>new Date(value-5*3600000).toISOString().slice(0,16);
      form.fecha_limite_aprovechamiento_declarada.value=local(limit);
      if(Date.parse(`${form.fecha_limite_recojo.value}:00-05:00`)>=limit)form.fecha_limite_recojo.value=local(limit-Math.min(5,min/2)*60000);
    });
  }
  window.REAPresentation={configure(value){ctx=value;},photo,profiles,comparison,decorate,enhance(root,state){decorate(root,state);donationForm(root,state);void routeForm(root,state);}};
  document.addEventListener('click',event=>{const button=event.target.closest('[data-presentation-tracking]');if(button)REACustody.open(Number(button.dataset.presentationTracking));});
})();
