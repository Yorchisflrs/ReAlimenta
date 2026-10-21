import {pool,transaction,audit} from '../server/db.js';
import {hashPassword} from '../server/auth.js';
try{
  await transaction(async client=>{
    let user=(await client.query("SELECT * FROM usuario WHERE correo='recovery.ui@realimenta.test'")).rows[0];
    if(user&&!user.es_demostracion)throw new Error('El correo pertenece a una cuenta no demostrativa; no se modificó.');
    if(!user){
      const hash=await hashPassword('PruebaCuenta2026!');
      user=(await client.query(`INSERT INTO usuario(nombre,correo,hash_contrasena,telefono,rol,es_demostracion) VALUES('Cuenta de recuperación de prueba','recovery.ui@realimenta.test',$1,'000000000','donante',true) RETURNING *`,[hash])).rows[0];
      await client.query(`INSERT INTO donante(id_usuario,nombre_establecimiento,distrito,direccion,latitud,longitud,ubicacion_confirmada,estado_verificacion,referencia) VALUES($1,'Cuenta aislada de pruebas de recuperación · DEMO','Puno','Parque Pino, punto público de demostración',-15.8377634,-70.0280229,true,'verificado','No representa una entidad ni una oferta real.')`,[user.id_usuario]);
      await audit(client,user.id_usuario,'usuario',user.id_usuario,'semilla_recuperacion_ui',{cuenta_aislada:true});
    }
    console.log('Cuenta recovery.ui@realimenta.test preparada; no se modificaron las cuentas demo principales.');
  });
}finally{await pool.end();}
