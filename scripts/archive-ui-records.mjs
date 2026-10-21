import {pool,transaction,audit} from '../server/db.js';
try{
  const count=await transaction(async client=>{
    const rows=(await client.query(`UPDATE donacion d SET ocultar_presentacion=true FROM donante dt,usuario u WHERE d.id_donante=dt.id_donante AND dt.id_usuario=u.id_usuario AND u.es_demostracion AND d.alimento LIKE 'Prueba UI %' AND NOT d.ocultar_presentacion RETURNING d.id_donacion`)).rows;
    for(const row of rows)await audit(client,null,'donacion',row.id_donacion,'ocultar_prueba_ui',{motivo:'Conservar registro técnico fuera de la vista de presentación, sin eliminarlo.'});return rows.length;
  });console.log(`${count} registros técnicos ocultados del catálogo. Los registros y su auditoría se conservan.`);
}finally{await pool.end();}
