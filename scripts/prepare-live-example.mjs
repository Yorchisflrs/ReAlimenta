import {pool,transaction,audit} from '../server/db.js';
import {createTracking,evaluateTracking} from '../server/custody.js';

// Un nuevo escenario vigente, sin cambiar fechas ni hitos de lotes anteriores.
try{
  const org=(await pool.query("SELECT o.*,u.id_usuario,u.es_demostracion FROM organizacion o JOIN usuario u USING(id_usuario) WHERE u.correo='organizacion@realimenta.test' AND u.es_demostracion")).rows[0];
  const donor=(await pool.query("SELECT d.*,u.es_demostracion FROM donante d JOIN usuario u USING(id_usuario) WHERE u.correo='donante@realimenta.test' AND u.es_demostracion")).rows[0];
  if(!org||!donor)throw new Error('No se encontraron las cuentas demostrativas.');
  const existing=(await pool.query(`SELECT d.id_donacion,t.id_seguimiento FROM donacion d JOIN solicitud s USING(id_donacion) JOIN seguimiento t USING(id_solicitud)
    WHERE d.id_donante=$1 AND d.descripcion LIKE '[DEMO:VIGENTE:SALSA]%' AND d.fecha_limite_aprovechamiento_declarada>now()+interval '30 minutes' AND t.estado='preparacion' ORDER BY d.id_donacion DESC LIMIT 1`,[donor.id_donante])).rows[0];
  if(existing){console.log(JSON.stringify({reutilizado:true,...existing}));}
  else{
    const result=await transaction(async client=>{
      const d=(await client.query(`INSERT INTO donacion(id_donante,alimento,categoria,cantidad,unidad,descripcion,fecha_disponibilidad,fecha_limite_recojo,fecha_limite_aprovechamiento_declarada,direccion_recojo,distrito,latitud_recojo,longitud_recojo,conservacion_declarada,requiere_cadena_frio,envase,observaciones,estado,imagen_clave,perfil_alimento)
        VALUES($1,'Salsa de tomate · coordinación inmediata','Alimentos preparados',12,'porciones','[DEMO:VIGENTE:SALSA] Escenario académico ficticio con plazo de 70 minutos para comprobar el cálculo; no representa un lote físico ni una recomendación sanitaria.',now()-interval '1 minute',now()+interval '30 minutes',now()+interval '70 minutes','Av. Sesquicentenario · sector universitario UNA, Puno (punto de demostración)','Puno',-15.8268629,-70.0141356,'Conservación refrigerada declarada para la demostración; debe verificarse en operaciones reales.',true,'Contenedor con tapa de demostración','Plazo específico del escenario, no vida útil universal del alimento.','en_proceso','salsa','preparado') RETURNING *`,[donor.id_donante])).rows[0];
      const s=(await client.query(`INSERT INTO solicitud(id_donacion,id_organizacion,responsable_recojo,telefono,transporte_declarado,recipiente_declarado,dispone_cadena_frio,fecha_propuesta,estado,observaciones)
        VALUES($1,$2,'Responsable logístico de demostración','000000000','Vehículo de muestra con medios de conservación declarados','Contenedor cerrado de muestra',true,now()+interval '5 minutes','aceptada','Escenario académico ficticio, no operación física real.') RETURNING *`,[d.id_donacion,org.id_organizacion])).rows[0];
      const t=await createTracking(client,s.id_solicitud,donor.id_usuario,true);
      await audit(client,donor.id_usuario,'donacion',d.id_donacion,'semilla_vigente',{escenario_ficticio:true,plazo_min:70,operaciones_previas_modificadas:false});
      return {...t,id_donacion:d.id_donacion,id_organizacion:org.id_organizacion,donacion:d,fecha_propuesta:s.fecha_propuesta,dispone_cadena_frio:true,incidencias_abiertas:0,incidencias_criticas:0};
    });
    const evaluated=await evaluateTracking(result,org,{preparacion_min:10,recojo_min:10,entrega_min:5,margen_seguridad_min:15});
    console.log(JSON.stringify({id_donacion:result.id_donacion,id_seguimiento:result.id_seguimiento,semaforo:evaluated.evaluacion.estado_viabilidad,distancia_km:evaluated.ruta.distancia_km,minutos_base:evaluated.ruta.duracion_estimada_min,margen_min:evaluated.evaluacion.margen_tiempo_min}));
  }
}finally{await pool.end();}
