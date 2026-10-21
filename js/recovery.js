document.addEventListener('DOMContentLoaded',()=>{
  const requestForm=document.querySelector('#recovery-request-form'),resetForm=document.querySelector('#recovery-reset-form');
  const error=document.querySelector('[data-recovery-error]'),message=document.querySelector('[data-recovery-message]'),demo=document.querySelector('[data-recovery-demo]'),code=document.querySelector('[data-recovery-code]');
  const showError=err=>{error.textContent=err.message;error.hidden=false;error.focus();};
  document.querySelector('[data-use-recovery-code]').addEventListener('click',()=>{resetForm.codigo.value=code.textContent;resetForm.contrasena.focus();});
  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!requestForm.reportValidity())return;
    const button=requestForm.querySelector('button[type="submit"]');button.disabled=true;error.hidden=true;message.hidden=true;demo.hidden=true;resetForm.hidden=true;
    try{
      const correo=requestForm.correo.value.trim().toLowerCase();
      const result=await REA.request('/api/auth/recuperacion/solicitar',{method:'POST',body:{correo}});
      message.textContent=result.data.message;message.hidden=false;
      if(result.data.demo?.codigo){
        code.textContent=result.data.demo.codigo;demo.hidden=false;resetForm.hidden=false;resetForm.correo.value=correo;resetForm.codigo.value='';resetForm.contrasena.value='';resetForm.confirmacion.value='';
      }
    }catch(err){showError(err);}finally{button.disabled=false;}
  });
  resetForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!resetForm.reportValidity())return;
    if(resetForm.contrasena.value!==resetForm.confirmacion.value){showError(new Error('Las contraseñas no coinciden.'));return;}
    const button=resetForm.querySelector('button[type="submit"]');button.disabled=true;error.hidden=true;
    try{
      await REA.request('/api/auth/recuperacion/restablecer',{method:'POST',body:{correo:resetForm.correo.value,codigo:resetForm.codigo.value.trim(),contrasena:resetForm.contrasena.value}});
      requestForm.hidden=true;resetForm.hidden=true;demo.hidden=true;message.hidden=true;code.textContent='';resetForm.reset();document.querySelector('[data-recovery-success]').hidden=false;
    }catch(err){showError(err);}finally{button.disabled=false;}
  });
});
