/* Resumen visual antes de confirmar y comprobante PDF del registro de una donación o de una solicitud. */
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  // Textos que ve el usuario para los valores guardados (los mismos del formulario).
  const names={
    categoria:{'Panadería':'Pan y panadería','Lácteos':'Leche, queso y yogur','Alimentos preparados':'Comida preparada','Abarrotes':'Abarrotes'},
    unidad:{unidades:'Unidades',kg:'Kilos (kg)',litros:'Litros',porciones:'Porciones / platos',cajas:'Cajas',bolsas:'Bolsas'},
    conservacion:{'Temperatura ambiente':'Fuera de la refrigeradora','Refrigerado':'En la refrigeradora','Congelado':'Congelado','Mantener caliente':'Debe mantenerse caliente','Otra condición declarada':'Otro'}
  };
  const show=(group,value)=>names[group][value]||value||'';
  const when=value=>value?new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace(/[  ]/g,' '):'';
  const qty=value=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:2}).format(Number(value||0));
  const states={disponible:'Publicada',pendiente:'Enviada, espera respuesta',aceptada:'Aceptada',rechazada:'Rechazada',cancelada:'Cancelada',en_proceso:'En proceso',finalizada:'Finalizada'};
  const ANGLES=['De frente','De costado','De cerca'];
  const card=(icon,label,main,extra)=>`<div class="rp-card"><span class="rp-icon"><i class="${icon}"></i></span><div><small>${label}</small><strong>${esc(main)}</strong>${extra?`<span>${esc(extra)}</span>`:''}</div></div>`;
  const buttons=(back,confirm,text)=>`<div class="mvp-message error" data-form-error tabindex="-1" hidden></div><div class="dialog-actions"><button class="btn btn-secondary" type="button" data-action="${back}"><i class="fa-solid fa-pen"></i> Corregir</button><button class="btn btn-primary" type="button" data-action="${confirm}"><i class="fa-solid fa-check"></i> ${text}</button></div>`;

  // d usa los nombres del formulario/API: alimento, categoria, cantidad, unidad, fechas, direccion_recojo...
  function preview(d,photos){
    const cold=d.requiere_cadena_frio?'Sí, debe ir frío':'No es necesario';
    return `<div class="receipt-preview">
      <div class="rp-hero"><div class="rp-qty"><strong>${qty(d.cantidad)}</strong><span>${esc(show('unidad',d.unidad))}</span></div><div><small>VAS A DONAR</small><h3>${esc(d.alimento)}</h3><span class="rp-chip">${esc(show('categoria',d.categoria))}</span></div></div>
      <div class="rp-photos">${photos.map(p=>`<figure>${p.url?`<img src="${esc(p.url)}" alt="Foto ${esc(p.title.toLowerCase())}">`:'<span class="rp-nophoto"><i class="fa-solid fa-image"></i></span>'}<figcaption>${esc(p.title)}</figcaption></figure>`).join('')}</div>
      <div class="rp-grid">
        ${card('fa-solid fa-snowflake','CÓMO SE GUARDA',show('conservacion',d.conservacion_declarada),`Empaque: ${d.envase} · Frío en el viaje: ${cold}${d.temperatura_declarada?` · ${d.temperatura_declarada}`:''}`)}
        ${card('fa-regular fa-clock','HORARIO DE RECOJO',`${when(d.fecha_disponibilidad)} a ${when(d.fecha_limite_recojo)}`,d.fecha_limite_aprovechamiento_declarada?`Consumir antes de: ${when(d.fecha_limite_aprovechamiento_declarada)}`:'')}
        ${card('fa-solid fa-location-dot','LUGAR DE RECOJO',d.direccion_recojo,[d.distrito,d.referencia].filter(Boolean).join(' · '))}
        ${d.descripcion||d.observaciones?card('fa-regular fa-note-sticky','DETALLES E INDICACIONES',d.descripcion||d.observaciones,d.descripcion&&d.observaciones?d.observaciones:''):''}
      </div>
      <p class="rp-note"><i class="fa-solid fa-file-pdf"></i> Al confirmar, tu donación quedará registrada y se descargará un <strong>comprobante en PDF</strong> como evidencia.</p>
      ${buttons('close-dialog','confirm-publish','Confirmar y publicar')}
    </div>`;
  }

  // r: valores del formulario de solicitud; d: donación que se pide.
  function requestPreview(r,d,profile={}){
    const photo=d.fotos?.[0]?.url;
    return `<div class="receipt-preview">
      <div class="rp-hero"><div class="rp-qty"><strong>${qty(d.cantidad)}</strong><span>${esc(show('unidad',d.unidad))}</span></div><div><small>VAS A SOLICITAR</small><h3>${esc(d.alimento)}</h3><span class="rp-chip">Dona: ${esc(d.donante?.nombre_establecimiento||d.donante_nombre||'Donante')}</span></div>${photo?`<img class="rp-thumb" src="${esc(photo)}" alt="Foto del alimento">`:''}</div>
      <div class="rp-grid">
        ${card('fa-solid fa-people-roof','BENEFICIARIA',profile.nombre||'Tu entidad',`${profile.direccion||''}${profile.distrito?` · ${profile.distrito}`:''}`)}
        ${card('fa-solid fa-user','QUIÉN RECOGE',r.responsable_recojo,`Teléfono: ${r.telefono}`)}
        ${card('fa-regular fa-clock','CUÁNDO IRÁN',when(r.fecha_propuesta),`Se puede recoger hasta: ${when(d.fecha_limite_recojo)}`)}
        ${card('fa-solid fa-truck','CÓMO LO LLEVARÁN',r.transporte_declarado,`En: ${r.recipiente_declarado} · Lo mantienen frío: ${r.dispone_cadena_frio?'Sí':'No'}`)}
        ${card('fa-solid fa-location-dot','DÓNDE SE RECOGE',d.direccion_recojo,[d.distrito,d.referencia].filter(Boolean).join(' · '))}
        ${r.observaciones?card('fa-regular fa-comment','MENSAJE PARA EL DONANTE',r.observaciones):''}
      </div>
      ${d.requiere_cadena_frio&&!r.dispone_cadena_frio?'<div class="mvp-message warning">Este alimento debe mantenerse frío y marcaste que no pueden mantenerlo frío. El donante podría rechazar la solicitud.</div>':''}
      <p class="rp-note"><i class="fa-solid fa-file-pdf"></i> Al confirmar, tu solicitud quedará registrada y se descargará un <strong>comprobante en PDF</strong>. La donación no queda reservada hasta que el donante acepte.</p>
      ${buttons('edit-request','confirm-request','Confirmar y enviar')}
    </div>`;
  }

  // jsPDF usa fuentes estándar (Latin-1): se reemplazan caracteres que no puede dibujar.
  const clean=value=>String(value??'').replace(/[  ]/g,' ').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/[^\x0a\x20-\x7e\xa0-\xff]/g,'');
  async function jpeg(url){
    if(!url)return null;
    try{
      const blob=await (await fetch(url,{credentials:'same-origin'})).blob();
      const bitmap=await createImageBitmap(blob);
      const size=Math.min(1,900/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*size);canvas.height=Math.round(bitmap.height*size);
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      return {data:canvas.toDataURL('image/jpeg',.82),ratio:canvas.width/canvas.height};
    }catch{return null;}
  }
  // Huella del contenido registrado: permite comprobar que el comprobante no fue alterado.
  async function fingerprint(values){
    if(!window.crypto?.subtle)return '';
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(values))));
    return [...hash.slice(0,8)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{4}/g).join('-');
  }

  // Piezas comunes de los dos comprobantes.
  const W=210,M=15,green=[11,113,86],soft=[238,244,232],ink=[40,62,52],muted=[110,128,100];
  function newDoc(subtitle,label,number){
    if(!window.jspdf?.jsPDF)throw new Error('No se pudo preparar el comprobante. Recarga la página e inténtalo otra vez.');
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    doc.t=(value,x,y,opt={})=>doc.text(clean(value),x,y,opt);
    doc.setFillColor(...green);doc.rect(0,0,W,38,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.t('REAlimenta',M,17);
    doc.setFont('helvetica','normal');doc.setFontSize(11);doc.t(subtitle,M,26);
    doc.setFontSize(9);doc.t('Alimentos que crean comunidad · Puno, Perú',M,32);
    doc.setFont('helvetica','bold');doc.setFontSize(10);doc.t(label,W-M,17,{align:'right'});
    doc.setFontSize(24);doc.t(`#${number}`,W-M,29,{align:'right'});
    return doc;
  }
  // Recuadro con fecha de registro, quién registra y estado.
  function registryBox(doc,y,date,whoLabel,who,whoDetail,status){
    doc.setFillColor(...soft);doc.roundedRect(M,y,W-2*M,22,3,3,'F');
    doc.setTextColor(...ink);doc.setFontSize(9);doc.setFont('helvetica','bold');
    doc.t('REGISTRADA EL',M+5,y+7);doc.t(whoLabel,M+62,y+7);doc.t('ESTADO',W-M-45,y+7);
    doc.setFont('helvetica','normal');doc.setFontSize(10);
    doc.t(when(date||new Date()),M+5,y+14);
    doc.t(doc.splitTextToSize(clean(who),75)[0]||'',M+62,y+14);
    doc.setFontSize(8.5);doc.setTextColor(...muted);doc.t(doc.splitTextToSize(clean(whoDetail),75)[0]||'',M+62,y+19);
    doc.setFontSize(10);doc.setTextColor(...green);doc.setFont('helvetica','bold');doc.text(doc.splitTextToSize(clean(status),42),W-M-45,y+14);
    return y+30;
  }
  function tiles(doc,y,list){
    const tw=(W-2*M-8)/3;
    list.forEach(([value,label],i)=>{
      const x=M+i*(tw+4);
      doc.setDrawColor(200,215,190);doc.setFillColor(255,255,255);doc.roundedRect(x,y,tw,24,3,3,'FD');
      doc.setTextColor(...green);doc.setFont('helvetica','bold');doc.setFontSize(i===0?18:10.5);
      const lines=doc.splitTextToSize(clean(value),tw-8).slice(0,2);doc.text(lines,x+tw/2,lines.length>1&&i>0?y+8:y+11,{align:'center'});
      doc.setTextColor(...muted);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.t(label,x+tw/2,y+19,{align:'center'});
    });
    return y+32;
  }
  async function photos(doc,y,urls,ph=36){
    doc.setTextColor(...ink);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.t('Fotos del alimento',M,y);y+=4;
    const pw=(W-2*M-8)/3;
    const images=await Promise.all([0,1,2].map(i=>jpeg(urls[i])));
    images.forEach((img,i)=>{
      const x=M+i*(pw+4);
      doc.setFillColor(245,247,240);doc.rect(x,y,pw,ph,'F');
      if(img){
        // Ajustar dentro del recuadro conservando la proporción.
        let w=pw,h=pw/img.ratio;if(h>ph){h=ph;w=ph*img.ratio;}
        doc.addImage(img.data,'JPEG',x+(pw-w)/2,y+(ph-h)/2,w,h);
      }else{doc.setTextColor(...muted);doc.setFontSize(8);doc.t('Sin foto',x+pw/2,y+ph/2,{align:'center'});}
      doc.setTextColor(...ink);doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.t(ANGLES[i],x+pw/2,y+ph+5,{align:'center'});
    });
    return y+ph+13;
  }
  // Secciones en dos columnas, de dos en dos.
  function sections(doc,y,list){
    const cw=(W-2*M-6)/2;
    const draw=([title,rows],x,top)=>{
      let yy=top;
      doc.setFillColor(...green);doc.rect(x,yy,1.4,6,'F');
      doc.setTextColor(...ink);doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.t(title,x+4,yy+4.5);yy+=10;
      for(const [label,value] of rows){
        doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...muted);doc.t(label.toUpperCase(),x+4,yy);yy+=3.6;
        doc.setFontSize(9.5);doc.setTextColor(...ink);
        const lines=doc.splitTextToSize(clean(value),cw-6).slice(0,4);doc.text(lines,x+4,yy);yy+=lines.length*4+1.9;
      }
      return yy;
    };
    for(let i=0;i<list.length;i+=2){
      if(i>0&&y>228){doc.addPage();y=20;}
      y=Math.max(draw(list[i],M,y),list[i+1]?draw(list[i+1],M+cw+6,y):0)+4;
    }
    return y-4;
  }
  function footer(doc,y,code,notes){
    let foot=y+6;
    if(foot>277){doc.addPage();foot=20;}
    doc.setDrawColor(200,215,190);doc.line(M,foot,W-M,foot);
    doc.setTextColor(...ink);doc.setFont('helvetica','bold');doc.setFontSize(9);
    if(code)doc.t(`Código de verificación: ${code}`,M,foot+6);
    doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...muted);
    notes.forEach((note,i)=>doc.t(note,M,foot+11+i*4));
  }

  async function download(d,user={},profile={},localPhotos=[]){
    const doc=newDoc('Comprobante de registro de donación','DONACIÓN N.º',d.id_donacion);
    let y=registryBox(doc,46,d.fecha_creacion,'DONANTE',profile.nombre_establecimiento||d.donante_nombre||'',user.correo||user.nombre||'',states[d.estado]||(d.estado?String(d.estado).replace(/_/g,' '):'Publicada'));
    y=tiles(doc,y,[[qty(d.cantidad),show('unidad',d.unidad)],[d.alimento,'Qué alimento es'],[show('categoria',d.categoria),'Tipo de alimento']]);
    y=await photos(doc,y,[0,1,2].map(i=>localPhotos[i]?.url||d.fotos?.[i]?.url));
    y=sections(doc,y,[
      ['Cómo se guarda',[['Forma de guardarlo',show('conservacion',d.conservacion_declarada)],['Empaque',d.envase],['Debe ir frío en el viaje',d.requiere_cadena_frio?'Sí':'No'],['Temperatura',d.temperatura_declarada||'No indicada']]],
      ['Horario de recojo',[['Se puede recoger desde',when(d.fecha_disponibilidad)],['Se puede recoger hasta',when(d.fecha_limite_recojo)],['Consumir antes de',when(d.fecha_limite_aprovechamiento_declarada)||'No indicado']]],
      ['Lugar de recojo',[['Dirección',d.direccion_recojo],['Distrito',d.distrito||'-'],['Referencia',d.referencia||d.indicaciones_recojo||'-'],['Coordenadas',d.latitud_recojo!=null?`${Number(d.latitud_recojo).toFixed(5)}, ${Number(d.longitud_recojo).toFixed(5)}`:'-']]],
      ['Detalles e indicaciones',[['Detalles',d.descripcion||'-'],['Indicaciones para el recojo',d.observaciones||'-']]]
    ]);
    const code=await fingerprint([d.id_donacion,d.alimento,d.cantidad,d.unidad,d.fecha_creacion,d.fecha_limite_recojo,d.direccion_recojo,(d.fotos||[]).map(f=>f.nombre_archivo||f.url)]);
    footer(doc,y,code,[`Documento generado el ${when(new Date())} desde REAlimenta. Conserva este archivo como evidencia del registro.`,'La información y las fotos fueron declaradas por el donante. La plataforma no certifica la calidad del alimento.']);
    doc.save(`comprobante-donacion-${d.id_donacion}.pdf`);
  }

  // r: solicitud tal como la devuelve /api/solicitudes (incluye donacion, organizacion y donante).
  async function downloadRequest(r,user={},profile={}){
    const d=r.donacion||{},org=r.organizacion||profile||{};
    const doc=newDoc('Comprobante de solicitud de donación','SOLICITUD N.º',r.id_solicitud);
    let y=registryBox(doc,46,r.fecha_creacion||r.fecha_solicitud,'BENEFICIARIA',org.nombre||r.organizacion_nombre||'',user.correo||user.nombre||'',states[r.estado]||String(r.estado||'Enviada').replace(/_/g,' '));
    y=tiles(doc,y,[[qty(r.cantidad_solicitada||d.cantidad),show('unidad',d.unidad||r.unidad)],[d.alimento||r.alimento,`Donación #${r.id_donacion}`],[r.donante?.nombre_establecimiento||r.donante_nombre||'-','Quién dona']]);
    if(d.fotos?.length)y=await photos(doc,y,d.fotos.map(f=>f.url),30);
    y=sections(doc,y,[
      ['Quién recoge',[['Responsable del recojo',r.responsable_recojo],['Teléfono',r.telefono],['Beneficiaria',org.nombre||'-'],['Dirección de la beneficiaria',[org.direccion,org.distrito].filter(Boolean).join(', ')||'-']]],
      ['Cuándo y cómo',[['Fecha y hora propuesta',when(r.fecha_propuesta)],['Transporte',r.transporte_declarado],['Recipiente',r.recipiente_declarado],['Pueden mantenerlo frío',r.dispone_cadena_frio?'Sí':'No']]],
      ['Lugar de recojo',[['Dirección',d.direccion_recojo||'-'],['Distrito',d.distrito||'-'],['Se puede recoger',`${when(d.fecha_disponibilidad)} a ${when(d.fecha_limite_recojo)}`],['Cómo se guarda',`${show('conservacion',d.conservacion_declarada)}${d.requiere_cadena_frio?' · debe ir frío':''}`]]],
      ['Mensaje para el donante',[['Mensaje',r.observaciones||'-']]]
    ]);
    const code=await fingerprint([r.id_solicitud,r.id_donacion,r.id_organizacion,r.responsable_recojo,r.telefono,r.fecha_propuesta,r.fecha_creacion]);
    footer(doc,y,code,[`Documento generado el ${when(new Date())} desde REAlimenta. Conserva este archivo como evidencia de tu solicitud.`,'La solicitud no reserva la donación: queda confirmada solo cuando el donante la acepta.']);
    doc.save(`comprobante-solicitud-${r.id_solicitud}.pdf`);
  }
  window.REAReceipt={preview,download,requestPreview,downloadRequest};
})();
