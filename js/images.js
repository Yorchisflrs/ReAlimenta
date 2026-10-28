/* Carga real de fotografías. No se guardan archivos ni códigos en localStorage. */
(() => {
  const accepted=new Set(['image/jpeg','image/png','image/webp']);
  // Tres fotos obligatorias, una por ángulo, para que la beneficiaria vea en qué estado está el alimento.
  const ANGLES=[
    {key:'frente',title:'De frente',help:'Que se vea el alimento completo.',icon:'fa-image'},
    {key:'costado',title:'De costado',help:'Gíralo o toma la foto desde un lado.',icon:'fa-rotate'},
    {key:'cerca',title:'De cerca',help:'Acércate: que se vea el estado, el envase y la fecha de vencimiento si tiene.',icon:'fa-magnifying-glass-plus'}
  ];
  const REQUIRED=ANGLES.length;
  // Algunos equipos no informan el tipo de .webp o .jpeg: se deduce por extensión y el servidor revisa el contenido real.
  const byExtension={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const mimeOf=file=>file.type||byExtension[String(file.name||'').split('.').pop().toLowerCase()]||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function mount(form,donation={}){
    if(form.dataset.photosMounted)return;form.dataset.photosMounted='true';
    form._reaPhotos=new Array(REQUIRED).fill(null);form._reaSavedPhotos=[...(donation.fotos||[])];
    const panel=document.createElement('section');panel.className='mvp-panel form-section-panel photo-section';
    panel.innerHTML=`<div class="form-section-heading"><span>02</span><div><h2>Fotos del alimento</h2><p>Sube <strong>3 fotos</strong> desde distintos ángulos. Así la beneficiaria ve cómo está el alimento antes de pedirlo.</p></div></div><div class="photo-slots" data-photo-slots></div><p class="field-hint photo-tips"><i class="fa-solid fa-lightbulb"></i> Consejos: usa buena luz, que el alimento salga enfocado y no fotografíes personas ni documentos. Puedes tomar la foto con el celular o elegirla de tu galería (JPG, PNG o WebP, hasta 5 MB).</p><p class="mvp-message error" role="alert" data-photo-error hidden></p>`;
    form.querySelector('.form-section-panel').after(panel);
    const slots=panel.querySelector('[data-photo-slots]'),error=panel.querySelector('[data-photo-error]');
    const showError=message=>{error.textContent=message;error.hidden=!message;};
    function paint(){
      slots.replaceChildren();const saved=form._reaSavedPhotos;
      ANGLES.forEach((angle,i)=>{
        const slot=document.createElement('div');slot.className='photo-slot';
        const savedPhoto=saved[i],item=form._reaPhotos[i];
        if(savedPhoto){
          slot.classList.add('filled');
          slot.innerHTML=`<img src="${esc(savedPhoto.url)}" alt="Foto ${esc(angle.title.toLowerCase())} ya guardada"><div class="photo-slot-copy"><strong>${i+1}. ${esc(angle.title)}</strong><span><i class="fa-solid fa-check"></i> Guardada</span></div>`;
        }else if(item){
          slot.classList.add('filled');
          const img=document.createElement('img');img.src=item.url;img.alt=`Vista previa: foto ${angle.title.toLowerCase()}`;
          const copy=document.createElement('div');copy.className='photo-slot-copy';copy.innerHTML=`<strong>${i+1}. ${esc(angle.title)}</strong><span><i class="fa-solid fa-check"></i> Lista</span>`;
          const remove=document.createElement('button');remove.type='button';remove.className='photo-remove';remove.setAttribute('aria-label',`Quitar la foto ${angle.title.toLowerCase()}`);remove.textContent='×';
          remove.addEventListener('click',()=>{URL.revokeObjectURL(item.url);form._reaPhotos[i]=null;paint();});
          slot.append(img,copy,remove);
        }else{
          slot.innerHTML=`<label class="photo-slot-empty"><i class="fa-solid ${angle.icon}" aria-hidden="true"></i><strong>${i+1}. ${esc(angle.title)}</strong><span>${esc(angle.help)}</span><em><i class="fa-solid fa-camera"></i> Agregar foto</em><input type="file" name="foto" data-photo-slot="${angle.key}" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"></label>`;
          slot.querySelector('input').addEventListener('change',event=>{
            const file=event.target.files[0];if(!file)return;
            if(!accepted.has(mimeOf(file))){showError('Ese archivo no es una foto válida. Usa una foto JPG, PNG o WebP.');return;}
            if(file.size===0||file.size>5*1024*1024){showError('La foto es muy pesada. Cada foto puede pesar hasta 5 MB.');return;}
            showError('');form._reaPhotos[i]={file,url:URL.createObjectURL(file),uploaded:false};paint();
          });
        }
        slots.append(slot);
      });
      // Donaciones antiguas pueden tener más de 3 fotos guardadas: se muestran todas.
      for(const extra of saved.slice(REQUIRED)){const slot=document.createElement('div');slot.className='photo-slot filled';slot.innerHTML=`<img src="${esc(extra.url)}" alt="Foto adicional ya guardada"><div class="photo-slot-copy"><strong>Foto adicional</strong><span><i class="fa-solid fa-check"></i> Guardada</span></div>`;slots.append(slot);}
    }
    paint();
  }
  // Nombres de los ángulos que todavía no tienen foto.
  function missing(form){
    if(!form._reaPhotos)return [];
    return ANGLES.filter((angle,i)=>!form._reaSavedPhotos[i]&&!form._reaPhotos[i]).map(angle=>angle.title.toLowerCase());
  }
  async function upload(donationId,form){
    const pending=(form._reaPhotos||[]).map((item,i)=>({item,angle:ANGLES[i]})).filter(({item})=>item&&!item.uploaded);
    const button=form.querySelector('[type="submit"]');
    // Se suben en orden (frente, costado, cerca) para que la foto de frente sea la portada.
    for(const [n,{item,angle}]of pending.entries()){
      button.textContent=`Subiendo foto ${n+1} de ${pending.length}…`;
      const named=new File([item.file],`${angle.key}_${item.file.name}`,{type:mimeOf(item.file)});
      const response=await REA.uploadPhoto(donationId,named);item.uploaded=true;form._reaSavedPhotos.push(response.data);
    }
  }
  // Direcciones de las 3 fotos (guardadas o recién elegidas) para el resumen y el comprobante.
  function previewUrls(form){return ANGLES.map((angle,i)=>({title:angle.title,url:form._reaSavedPhotos?.[i]?.url||form._reaPhotos?.[i]?.url||null}));}
  function dispose(root){root.querySelectorAll('#donation-form').forEach(form=>form._reaPhotos?.forEach(item=>item&&URL.revokeObjectURL(item.url)));}
  window.REAImages={mount,upload,dispose,missing,previewUrls,mimeOf,ANGLES};
})();
