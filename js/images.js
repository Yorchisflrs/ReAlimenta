/* Carga real de fotografías. No se guardan archivos ni códigos en localStorage. */
(() => {
  const accepted=new Set(['image/jpeg','image/png','image/webp']);const MAX=5;
  // Algunos equipos no informan el tipo de .webp o .jpeg: se deduce por extensión y el servidor revisa el contenido real.
  const byExtension={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const mimeOf=file=>file.type||byExtension[String(file.name||'').split('.').pop().toLowerCase()]||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function mount(form,donation={}){
    if(form.dataset.photosMounted)return;form.dataset.photosMounted='true';
    form._reaPhotos=[];form._reaSavedPhotos=[...(donation.fotos||[])];
    const panel=document.createElement('div');panel.className='photo-upload-panel';
    panel.innerHTML='<div class="photo-upload-intro"><span><i class="fa-solid fa-camera"></i></span><div><h3>Fotografías de tu donación</h3><p>Muestra el alimento que compartes. Puedes agregar hasta 5 fotos JPG, JPEG, PNG o WebP, de máximo 5 MB cada una.</p></div></div><label class="photo-file-field">Seleccionar fotografías<input class="form-control" type="file" name="foto" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple aria-describedby="photo-upload-help"></label><p class="small-muted" id="photo-upload-help">La primera foto será la portada. Se guardan al publicar; no compartas personas, documentos ni datos privados sin autorización. Si no subes fotos, se usa una imagen referencial.</p><div class="photo-preview-grid" data-photo-preview hidden></div><p class="mvp-message error" role="alert" data-photo-error hidden></p>';
    form.querySelector('.form-section-panel .form-grid').after(panel);
    const input=panel.querySelector('input[type="file"]'),preview=panel.querySelector('[data-photo-preview]'),error=panel.querySelector('[data-photo-error]');
    function paint(){
      preview.replaceChildren();const saved=form._reaSavedPhotos;
      for(const photo of saved){const figure=document.createElement('figure');figure.innerHTML=`<img src="${esc(photo.url)}" alt="Fotografía guardada de la donación"><figcaption><i class="fa-solid fa-check"></i> Guardada</figcaption>`;preview.append(figure);}
      for(const [i,item]of form._reaPhotos.entries()){
        if(item.uploaded)continue;
        const figure=document.createElement('figure');const img=document.createElement('img');img.src=item.url;img.alt=`Vista previa de ${item.file.name}`;
        const caption=document.createElement('figcaption');caption.textContent=`${saved.length+i===0?'Portada · ':''}${item.file.name}`;
        const remove=document.createElement('button');remove.type='button';remove.className='photo-remove';remove.setAttribute('aria-label',`Quitar ${item.file.name} de la selección`);remove.textContent='×';remove.addEventListener('click',()=>{URL.revokeObjectURL(item.url);form._reaPhotos=form._reaPhotos.filter(x=>x!==item);input.value='';paint();});figure.append(img,caption,remove);preview.append(figure);
      }
      preview.hidden=!preview.children.length;
      input.disabled=saved.length>=MAX;
    }
    input.addEventListener('change',()=>{
      error.hidden=true;
      const files=[...input.files];
      let message='';
      if(files.length+form._reaSavedPhotos.length>MAX)message=`Puedes guardar hasta ${MAX} fotografías por donación.`;
      else if(files.some(f=>!accepted.has(mimeOf(f))))message='Formato no admitido. Selecciona fotografías JPG, JPEG, PNG o WebP; no SVG, GIF ni documentos.';
      else if(files.some(f=>f.size>5*1024*1024||f.size===0))message='Cada foto debe tener contenido y pesar como máximo 5 MB.';
      if(message){error.textContent=message;error.hidden=false;input.value='';return;}
      form._reaPhotos.filter(x=>!x.uploaded).forEach(x=>URL.revokeObjectURL(x.url));
      form._reaPhotos=files.map(file=>({file,url:URL.createObjectURL(file),uploaded:false}));paint();
    });paint();
  }
  async function upload(donationId,form){
    const photos=form._reaPhotos||[];const pending=photos.filter(x=>!x.uploaded);
    const button=form.querySelector('[type="submit"]');
    for(const [i,item]of pending.entries()){
      button.textContent=`Guardando fotografía ${i+1} de ${pending.length}…`;
      const response=await REA.uploadPhoto(donationId,item.file);item.uploaded=true;form._reaSavedPhotos.push(response.data);
    }
  }
  function dispose(root){root.querySelectorAll('#donation-form').forEach(form=>form._reaPhotos?.forEach(item=>URL.revokeObjectURL(item.url)));}
  window.REAImages={mount,upload,dispose,mimeOf};
})();
