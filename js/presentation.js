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
  function photo(d){
    const url=d.fotos?.[0]?.url;
    if(typeof url==='string'&&/^\/media\/donaciones\/donacion_\d+_[a-f0-9]{16}\.webp$/.test(url))return url;
    const food=`${d.alimento||''} ${d.categoria||''}`.toLocaleLowerCase('es');
    if(/papa|oca\b|yuca|tubérculo/.test(food))return 'assets/images/fondos/cosecha-andina-v2.png';
    if(/queso/.test(food))return 'assets/images/fondos/pan-queso-local-v2.png';
    return `assets/images/alimentos/${key(d)}.jpg`;
  }
  function decorate(root,state){
    root.querySelectorAll('.mvp-donation-card').forEach(card=>{
      if(card.dataset.photographed)return;
      const id=card.querySelector('[data-action="detail"]')?.dataset.id;
      const d=state.donations.find(d=>String(d.id_donacion)===id);if(!d)return;
      card.dataset.photographed='true';
      const visual=card.querySelector('.food-visual');visual.classList.add('has-photo');
      const img=document.createElement('img');img.src=photo(d);img.alt=`${d.fotos?.length?'Fotografía compartida por el donante':'Fotografía referencial'} de ${d.alimento}`;img.loading='lazy';img.decoding='async';visual.prepend(img);
      visual.querySelector(':scope > i')?.remove();
      const reference=document.createElement('span');reference.className='photo-reference';reference.textContent=d.fotos?.length?'Foto del donante':'Foto referencial';visual.append(reference);
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
        row.innerHTML=`<div><i class="fa-solid fa-route"></i><strong>${num(plan.ruta.distancia_km)} km</strong><span>${num(plan.ruta.duracion_estimada_min)} min base</span></div><small>Hasta ${esc(plan.destino?.nombre||state.profile.nombre||'beneficiaria evaluada')} · sin tráfico en vivo</small>`;
        badge.before(row);
        const tone=plan.evaluacion.estado_viabilidad;
        badge.className=`mini-feasibility ${['verde','amarillo','rojo','gris'].includes(tone)?tone:'gris'}`;
        const words={verde:'Margen de tiempo suficiente',amarillo:'Margen reducido · revisar',rojo:'No viable · requiere revisión',gris:d.requiere_cadena_frio?'Confirma los medios de cadena de frío':'Faltan datos para evaluar'};
        badge.innerHTML=`<span></span>${words[tone]||words.gris}`;
      } else badge.innerHTML='<span></span>Abre la ruta para evaluar este traslado';
      const mini=document.createElement('small');mini.className='declared-deadline';mini.textContent='Tiempo hasta el límite declarado; no garantiza aptitud de consumo.';body.querySelector('.card-time').after(mini);
    });
    root.querySelectorAll('.mvp-request-card').forEach(card=>{
      const id=card.querySelector('[data-action="request-detail"]')?.dataset.id;
      const request=state.requests.find(r=>String(r.id_solicitud)===id);
      if(!request?.id_seguimiento||card.querySelector('[data-presentation-tracking]'))return;
      const link=document.createElement('button');link.type='button';link.className='btn btn-primary';link.dataset.presentationTracking=request.id_seguimiento;link.innerHTML='<i class="fa-solid fa-route"></i> Abrir seguimiento y custodia';card.querySelector('.request-card-actions').append(link);
    });
  }
  function comparison(result){
    if(!result?.ruta)return '';
    const base=Number(result.ruta.duracion_estimada_min),extra=Number(result.evaluacion?.demora_trafico_min||0);
    return `<div class="traffic-comparison"><div><span><i class="fa-solid fa-road"></i> Ruta base</span><strong>${num(base)} <small>min</small></strong><p>Estimación del proveedor</p></div><div><span><i class="fa-solid fa-car-side"></i> Con demora elegida</span><strong>${num(base+extra)} <small>min</small></strong><p>Base + ${num(extra)} min de escenario</p></div><div><span><i class="fa-solid fa-shield-heart"></i> Margen logístico</span><strong>${num(result.evaluacion?.margen_seguridad_min)} <small>min</small></strong><p>Reserva adicional de planificación</p></div></div><p class="traffic-disclaimer">Los escenarios de congestión son supuestos manuales, no mediciones de tráfico en vivo. La duración real puede variar.</p>`;
  }
  function journey(result,places={}){
    if(!result?.ruta)return '';
    const pickup=result.ruta_recojo,origin=places.origen||result.origen||result.ruta.origen,destination=places.destino||result.destino||result.ruta.destino;
    const from=origin?.nombre||origin?.direccion||'Establecimiento donante',to=destination?.nombre||destination?.direccion||'Beneficiaria';
    return `<div class="journey-legs"><article class="journey-leg ${!pickup?'completed':''}" data-journey-leg="recojo"><span><i class="fa-solid fa-car-side"></i> 1 · Ir al punto de recojo</span><strong>${pickup?`${num(pickup.distancia_km)} km · ${num(pickup.duracion_estimada_min)} min`:'Recojo ya registrado'}</strong><p>${esc(to)} → ${esc(from)}</p><small>${pickup?'Ida por carretera; se incluye en el tiempo total antes del recojo.':'El viaje de ida ya no se vuelve a sumar.'}</small></article><article class="journey-leg" data-journey-leg="entrega"><span><i class="fa-solid fa-box"></i> 2 · Trasladar los alimentos</span><strong>${num(result.ruta.distancia_km)} km · ${num(result.ruta.duracion_estimada_min)} min</strong><p>${esc(from)} → ${esc(to)}</p><small>Ruta base mostrada en el mapa. La demora elegida se suma a este traslado.</small></article></div>`;
  }
  // Detalle: foto principal y galería por ángulo. El cálculo de llegada lo hace mvp.js con el mapa simple.
  function routeForm(root,state){
    const form=root.querySelector('#eta-form');if(!form||form.dataset.enhanced)return;
    form.dataset.enhanced='true';
    const selected=state.selected;
    const description=root.querySelector('.detail-summary>p');if(description)description.textContent=description.textContent.replace(/^\[DEMO:(?:SEED|PRESENTACION):[A-Z_]+\]\s*/,'');
    const hero=document.createElement('div');hero.className='detail-food-photo';hero.innerHTML=`<img src="${photo(selected)}" alt="${selected.fotos?.length?'Fotografía compartida por el donante':'Fotografía referencial del tipo de alimento'}"><span>${selected.fotos?.length?'Foto del donante':'Fotografía referencial'} · ${esc(profiles[selected.perfil_alimento]||profiles.general)}</span>`;
    root.querySelector('.detail-summary').prepend(hero);
    if(selected.fotos?.length>1){
      const angles=['De frente','De costado','De cerca'];
      const gallery=document.createElement('div');gallery.className='detail-food-gallery';
      // Al tocar una miniatura se ve en grande, para revisar el alimento desde cada ángulo.
      selected.fotos.forEach((f,i)=>{const figure=document.createElement('figure');const img=document.createElement('img');img.src=f.url;img.alt=`Foto ${(angles[i]||'adicional').toLowerCase()} compartida por el donante`;const caption=document.createElement('figcaption');caption.textContent=angles[i]||'Foto adicional';figure.append(img,caption);figure.addEventListener('click',()=>{hero.querySelector('img').src=f.url;hero.querySelector('img').alt=img.alt;});gallery.append(figure);});
      hero.after(gallery);
    }
  }
  function donationForm(root,state){
    const form=root.querySelector('#donation-form');if(!form||form.dataset.enhanced)return;
    form.dataset.enhanced='true';
    const d=form.dataset.id?state.selected:{};
    REAImages.mount(form,d||{});
    // El perfil del alimento se deduce de la categoría para no pedir dos veces lo mismo al donante.
    const byCategory={'Panadería':'panaderia','Frutas':'frutas','Verduras':'hortalizas','Lácteos':'refrigerado','Alimentos preparados':'preparado','Abarrotes':'seco'};
    const profile=document.createElement('input');profile.type='hidden';profile.name='perfil_alimento';profile.value=d?.perfil_alimento||byCategory[form.categoria.value]||'general';form.append(profile);
    form.categoria.addEventListener('change',()=>{profile.value=byCategory[form.categoria.value]||'general';});
  }
  window.REAPresentation={configure(value){ctx=value;},photo,profiles,comparison,journey,decorate,enhance(root,state){decorate(root,state);donationForm(root,state);routeForm(root,state);}};
  document.addEventListener('click',event=>{const button=event.target.closest('[data-presentation-tracking]');if(button)REACustody.open(Number(button.dataset.presentationTracking));});
})();
