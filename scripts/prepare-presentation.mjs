import { writeFile } from 'node:fs/promises';
import { pool, transaction, audit } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { createTracking, evaluateTracking } from '../server/custody.js';
import { calculateRoute, evaluateLogistics } from '../server/logistics.js';

// Exclusivamente datos académicos, con ubicaciones públicas comprobadas en Nominatim.
const points = {
  centro:{direccion:'Jr. Deustua · entorno de la Catedral de Puno (punto de demostración)',distrito:'Puno',latitud:-15.840908,longitud:-70.0289581},
  universidad:{direccion:'Av. Sesquicentenario · sector universitario UNA, Puno (punto de demostración)',distrito:'Puno',latitud:-15.8268629,longitud:-70.0141356},
  mercado:{direccion:'Jr. Tacna · entorno del Mercado Central, Puno (punto de demostración)',distrito:'Puno',latitud:-15.8374864,longitud:-70.0265406},
  pino:{direccion:'Jr. Lima · Parque Pino, Puno (punto de demostración)',distrito:'Puno',latitud:-15.8377634,longitud:-70.0280229},
  juliaca:{direccion:'Entorno de Plaza de Armas, Juliaca (punto de demostración)',distrito:'Juliaca',latitud:-15.4932157,longitud:-70.1355925}
};
const now = new Date();
const localDay = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const meeting = Math.max(Date.parse(`${localDay}T13:00:00-05:00`),Date.now()+15*60000);
const iso = minutes => new Date(Date.now()+minutes*60000).toISOString();
const at = minutes => new Date(meeting+minutes*60000).toISOString();
const report={fecha:now.toISOString(),datos:'Ficticios para presentación académica, sin ofertas ni eventos físicos reales.',puntos:points,donaciones:[],seguimientos:[],rutas:[],archivadas:[]};
try {
  const demoUsers=(await pool.query("SELECT * FROM usuario WHERE es_demostracion AND correo IN ('donante@realimenta.test','organizacion@realimenta.test','organizacion2@realimenta.test','admin@realimenta.test')")).rows;
  if(demoUsers.length!==4)throw new Error('Ejecute primero db:seed; no se encontraron las cuatro cuentas demostrativas.');
  const admin=demoUsers.find(u=>u.rol==='administrador');
  const passwordHash=await hashPassword('Realimenta2026!');
  await transaction(async client=>{
    const hidden=(await client.query(`UPDATE donacion d SET ocultar_presentacion=true FROM donante dt,usuario u
      WHERE d.id_donante=dt.id_donante AND dt.id_usuario=u.id_usuario AND u.es_demostracion
      AND d.alimento LIKE 'Prueba UI %' AND NOT d.ocultar_presentacion RETURNING d.id_donacion`)).rows;
    report.archivadas=hidden.map(r=>r.id_donacion);
    for(const d of hidden)await audit(client,admin.id_usuario,'donacion',d.id_donacion,'ocultar_de_presentacion',{motivo:'Registro técnico conservado íntegramente en base y auditoría; no se elimina.'});
    const org2=demoUsers.find(u=>u.correo==='organizacion2@realimenta.test');
    await client.query(`UPDATE organizacion SET nombre='Red Solidaria Juliaca · DEMO',direccion=$2,distrito=$3,provincia='San Román',latitud=$4,longitud=$5 WHERE id_usuario=$1`,[org2.id_usuario,points.juliaca.direccion,'Juliaca',points.juliaca.latitud,points.juliaca.longitud]);
    await audit(client,admin.id_usuario,'usuario',org2.id_usuario,'preparar_demo_juliaca',{punto_publico:true});
    const defs=[['cocina.universitaria','Cocina Universitaria del Lago · DEMO','universidad'],['huerta.solidaria','Huerta Solidaria · DEMO','mercado'],['despensa.juliaca','Despensa Andina Juliaca · DEMO','juliaca']];
    for(const [email,name,point] of defs){
      const correo=`${email}@realimenta.test`;
      let user=(await client.query('SELECT * FROM usuario WHERE correo=$1',[correo])).rows[0];
      if(user&&!user.es_demostracion)throw new Error('Conflicto de cuenta no demostrativa; no se modificó.');
      if(!user)user=(await client.query(`INSERT INTO usuario(nombre,correo,hash_contrasena,telefono,rol,es_demostracion) VALUES($1,$2,$3,'000000000','donante',true) RETURNING *`,[name,correo,passwordHash])).rows[0];
      const p=points[point];
      await client.query(`INSERT INTO donante(id_usuario,nombre_establecimiento,distrito,direccion,latitud,longitud,ubicacion_confirmada,estado_verificacion,referencia)
        VALUES($1,$2,$3,$4,$5,$6,true,'verificado','Entidad ficticia; el punto público no implica afiliación ni oferta real.') ON CONFLICT(id_usuario) DO NOTHING`,[user.id_usuario,name,p.distrito,p.direccion,p.latitud,p.longitud]);
    }
  });
  const donors=(await pool.query('SELECT d.*,u.correo FROM donante d JOIN usuario u USING(id_usuario) WHERE u.es_demostracion')).rows;
  const organizations=(await pool.query('SELECT o.*,u.id_usuario,u.es_demostracion FROM organizacion o JOIN usuario u USING(id_usuario) WHERE u.es_demostracion ORDER BY o.id_organizacion')).rows;
  const org=organizations.find(o=>o.id_usuario===demoUsers.find(u=>u.correo==='organizacion@realimenta.test').id_usuario);
  const orgJ=organizations.find(o=>o.distrito==='Juliaca');
  const main=donors.find(d=>d.correo==='donante@realimenta.test');
  const university=donors.find(d=>d.correo==='cocina.universitaria@realimenta.test');
  const garden=donors.find(d=>d.correo==='huerta.solidaria@realimenta.test');
  const jul=donors.find(d=>d.correo==='despensa.juliaca@realimenta.test');
  const foods=[
    ['HOGAZAS','Hogazas artesanales del día','Panadería',24,'unidades','pan','panaderia',main,'centro',false,30*60,'Hogazas enteras para distribuir en porciones.','Bolsas de papel cerradas; mantener protegido y seco.'],
    ['TOMATES','Tomates seleccionados para salsa','Verduras',15,'kg','salsa','hortalizas',garden,'mercado',false,36*60,'Tomates de maduración uniforme para coordinación con cocina.','Cajas limpias y ventiladas, sin apilar en exceso.'],
    ['ARROZ','Arroz envasado para despensa','Abarrotes',20,'kg','arroz','seco',main,'centro',false,7*24*60,'Bolsas selladas de producto seco. Revisar etiqueta y lote al recibir.','Envase original cerrado; lugar seco, sin humedad.'],
    ['CREMA','Crema de verduras · recojo coordinado','Alimentos preparados',25,'porciones','sopa','preparado',university,'universidad',true,24*60,'Escenario académico de preparación refrigerada. El donante define fecha y condiciones; no se infieren por categoría.','Conservación refrigerada declarada; contenedor alimentario con tapa y transporte apropiado.'],
    ['GALLETAS','Galletas artesanales de avena','Panadería',45,'unidades','galletas','panaderia',main,'centro',false,48*60,'Paquetes cerrados de galletas para distribución.','Proteger de humedad y contaminación; revisar ingredientes y alérgenos.'],
    ['FRUTA','Canastas de fruta de temporada','Frutas',10,'cajas','fruta','frutas',garden,'mercado',false,48*60,'Fruta entera de muestra: selección y verificación al recibir.','Canastas ventiladas, limpias y protegidas de golpes.'],
    ['VERDURAS','Hortalizas de la huerta','Verduras',18,'kg','verduras','hortalizas',garden,'mercado',false,36*60,'Selección variada de verduras para cocina comunitaria.','Cajas ventiladas, separar de sustancias contaminantes.'],
    ['LECHE','Leche en envase cerrado','Lácteos',24,'litros','leche','refrigerado',jul,'juliaca',true,36*60,'Demostración de oferta interurbana. Revisar fecha de etiqueta, envase y conservación antes de aceptar.','Refrigeración declarada; traslado en contenedor térmico con control documentado.'],
    ['ENSALADA','Ensalada de verduras · coordinación local','Alimentos preparados',16,'porciones','ensalada','preparado',university,'universidad',true,24*60,'Lote ilustrativo de preparación fría; la fotografía no acredita este lote.','Recipientes individuales con tapa, conservación refrigerada declarada.'],
    ['PANJUL','Pan de molde · ruta Juliaca–Puno','Panadería',36,'unidades','pan','panaderia',jul,'juliaca',false,48*60,'Ejemplo interurbano con ruta real por carretera, sujeto a coordinación.','Bolsas cerradas en cajas limpias, protegidas de humedad.']
  ];
  async function addFood({key,name,category,quantity,unit,image,profile,donor,point,cold,deadline,description,preservation,available=iso(-5),pickup=iso(12*60),state='disponible'}) {
    const marker=`[DEMO:PRESENTACION:${key}]`;
    const found=(await pool.query('SELECT * FROM donacion WHERE descripcion LIKE $1',[`${marker}%`])).rows[0];
    if(found)return found;
    const p=points[point];
    return transaction(async client=>{
      const d=(await client.query(`INSERT INTO donacion(id_donante,alimento,categoria,cantidad,unidad,descripcion,fecha_disponibilidad,fecha_limite_recojo,fecha_limite_aprovechamiento_declarada,direccion_recojo,distrito,latitud_recojo,longitud_recojo,conservacion_declarada,requiere_cadena_frio,envase,observaciones,imagen_clave,perfil_alimento,estado)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,[donor.id_donante,name,category,quantity,unit,`${marker} ${description}`,available,pickup,deadline,p.direccion,p.distrito,p.latitud,p.longitud,preservation,cold,'Contenedor cerrado de demostración','Datos ficticios para exposición académica; confirmar lote y condiciones reales antes de operar.',image,profile,state])).rows[0];
      await audit(client,admin.id_usuario,'donacion',d.id_donacion,'semilla_presentacion',{key,punto_publico:true});return d;
    });
  }
  for(const [key,name,category,quantity,unit,image,profile,donor,point,cold,minutes,description,preservation] of foods){
    const d=await addFood({key,name,category,quantity,unit,image,profile,donor,point,cold,deadline:iso(minutes),description,preservation});
    report.donaciones.push({id:d.id_donacion,alimento:d.alimento});
  }
  // Las tres ofertas iniciales se mantienen, con fotografía referencial.
  await pool.query(`UPDATE donacion SET imagen_clave=CASE WHEN categoria='Panadería' THEN 'pan' WHEN categoria='Lácteos' THEN 'yogur' ELSE 'fruta' END
    WHERE id_donante=$1 AND descripcion LIKE '[DEMO:SEED:%' AND imagen_clave=''`,[main.id_donante]);
  const scenarios=[
    {key:'CUSTODIA_PAN',name:'Pan integral · entrega al Comedor Esperanza',category:'Panadería',quantity:30,unit:'unidades',image:'pan',profile:'panaderia',donor:main,point:'centro',cold:false,deadline:iso(24*60),stages:['listo','recogido','en_transito'],recipient:org},
    {key:'CUSTODIA_SALSA',name:'Salsa de tomate · coordinación universitaria',category:'Alimentos preparados',quantity:12,unit:'porciones',image:'salsa',profile:'preparado',donor:main,point:'universidad',cold:true,deadline:at(55),available:at(-5),pickup:at(30),stages:[],recipient:org,proposed:at(0)},
    {key:'CUSTODIA_INTERURBANA',name:'Crema de verduras · evaluación Puno–Juliaca',category:'Alimentos preparados',quantity:20,unit:'porciones',image:'sopa',profile:'preparado',donor:university,point:'universidad',cold:true,deadline:at(55),available:at(-5),pickup:at(30),stages:[],recipient:orgJ,proposed:at(0)},
    {key:'CUSTODIA_FRIO',name:'Yogur envasado · conservación en revisión',category:'Lácteos',quantity:18,unit:'unidades',image:'yogur',profile:'refrigerado',donor:main,point:'centro',cold:true,deadline:iso(24*60),stages:['listo'],recipient:org,incident:true},
    {key:'CUSTODIA_RECIBIDA',name:'Canastas de fruta · recepción confirmada',category:'Frutas',quantity:8,unit:'cajas',image:'fruta',profile:'frutas',donor:garden,point:'mercado',cold:false,deadline:iso(36*60),stages:['listo','recogido','en_transito','entregado','confirmado'],recipient:org}
  ];
  for(const scenario of scenarios){
    const d=await addFood({...scenario,state:'en_proceso',description:'Escenario ficticio de cadena de custodia para demostración; no representa una entrega ni un lote físico real.',preservation:scenario.cold?'Conservación refrigerada declarada; verificar antes de distribuir.':'Alimento protegido en envase cerrado según declaración de demostración.'});
    const t=await transaction(async client=>{
      let s=(await client.query('SELECT * FROM solicitud WHERE id_donacion=$1 AND estado=\'aceptada\'',[d.id_donacion])).rows[0];
      if(!s){
        s=(await client.query(`INSERT INTO solicitud(id_donacion,id_organizacion,responsable_recojo,telefono,transporte_declarado,recipiente_declarado,dispone_cadena_frio,fecha_propuesta,estado,observaciones)
          VALUES($1,$2,'Responsable logístico de demostración','000000000','Vehículo de coordinación académica','Contenedor cerrado de demostración',$3,$4,'aceptada','Escenario ficticio, no una solicitud real.') RETURNING *`,[d.id_donacion,scenario.recipient.id_organizacion,scenario.cold,scenario.proposed||iso(10)])).rows[0];
        await audit(client,admin.id_usuario,'solicitud',s.id_solicitud,'semilla_aceptacion',{escenario_ficticio:true});
      }
      const created=await createTracking(client,s.id_solicitud,scenario.donor.id_usuario,true);
      const track=created||(await client.query('SELECT * FROM seguimiento WHERE id_solicitud=$1',[s.id_solicitud])).rows[0];
      if(created){
        for(const stage of scenario.stages){
          const receiver=['entregado','confirmado'].includes(stage)?scenario.recipient.nombre:'Responsable logístico de demostración';
          await client.query(`INSERT INTO hito_custodia(id_seguimiento,id_usuario,tipo,estado_resultante,responsable_entrega,responsable_recibe,lugar,condicion_declarada,conserva_frio,observacion,es_demostracion)
            VALUES($1,$2,$3,$3,$4,$5,$6,'sin_novedad',$7,'Hito ficticio de demostración; no representa una verificación ni una entrega física real.',true)`,[track.id_seguimiento,['listo','recogido'].includes(stage)?scenario.donor.id_usuario:scenario.recipient.id_usuario,stage,scenario.donor.nombre_establecimiento,receiver,['entregado','confirmado'].includes(stage)?scenario.recipient.direccion:d.direccion_recojo,scenario.cold?true:null]);
        }
        if(scenario.stages.length)await client.query('UPDATE seguimiento SET estado=$2,custodio_actual=$3,version=version+$4,fecha_actualizacion=now() WHERE id_seguimiento=$1',[track.id_seguimiento,scenario.stages.at(-1),scenario.stages.includes('entregado')?scenario.recipient.nombre:'Responsable logístico de demostración',scenario.stages.length]);
        if(scenario.incident)await client.query(`INSERT INTO incidencia(id_seguimiento,id_usuario,tipo,severidad,titulo,descripcion) VALUES($1,$2,'temperatura','alta','Medición de conservación pendiente','Escenario ficticio: falta documentar la conservación antes de continuar. Requiere revisión del responsable; no autoriza distribuir el lote.')`,[track.id_seguimiento,scenario.donor.id_usuario]);
      }
      return {...track,id_donacion:d.id_donacion,id_organizacion:scenario.recipient.id_organizacion,donacion:d,fecha_propuesta:s.fecha_propuesta,dispone_cadena_frio:s.dispone_cadena_frio,incidencias_criticas:scenario.incident?1:0,incidencias_abiertas:scenario.incident?1:0,estado:scenario.stages.at(-1)||'preparacion'};
    });
    report.seguimientos.push({id:t.id_seguimiento,alimento:d.alimento,etapa:t.estado});
    try { const evaluation=await evaluateTracking(t,scenario.recipient,{preparacion_min:10,recojo_min:10,entrega_min:5,margen_seguridad_min:15});report.rutas.push({id_donacion:d.id_donacion,distancia_km:evaluation.ruta.distancia_km,duracion_min:evaluation.ruta.duracion_estimada_min,puntos:evaluation.ruta.geometry.coordinates.length,semaforo:evaluation.evaluacion.estado_viabilidad}); }
    catch(error){report.rutas.push({id_donacion:d.id_donacion,error:error.message});}
  }
  const catalog=(await pool.query("SELECT d.* FROM donacion d JOIN donante dt USING(id_donante) JOIN usuario u USING(id_usuario) WHERE u.es_demostracion AND NOT d.ocultar_presentacion AND d.estado='disponible'")).rows;
  for(const d of catalog){
    try{
      const route=await calculateRoute({latitud:d.latitud_recojo,longitud:d.longitud_recojo},org);
      const parameters={preparacion_min:10,recojo_min:10,entrega_min:5,margen_seguridad_min:15};
      const evaluation=evaluateLogistics(d,route,parameters);
      await pool.query(`INSERT INTO evaluacion_ruta(id_donacion,id_usuario,id_organizacion,origen_latitud,origen_longitud,destino_latitud,destino_longitud,distancia_km,duracion_estimada_min,tiempo_total_estimado_min,margen_tiempo_min,estado_viabilidad,proveedor_ruta,geometria,detalle)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[d.id_donacion,org.id_usuario,org.id_organizacion,d.latitud_recojo,d.longitud_recojo,org.latitud,org.longitud,route.distancia_km,route.duracion_estimada_min,evaluation.tiempo_total_estimado_min,evaluation.margen_tiempo_min,evaluation.estado_viabilidad,route.proveedor,JSON.stringify(route.geometry),JSON.stringify({...evaluation,ruta:route,parametros:parameters})]);
      report.rutas.push({id_donacion:d.id_donacion,distancia_km:route.distancia_km,duracion_min:route.duracion_estimada_min,puntos:route.geometry.coordinates.length});
    }catch(error){report.rutas.push({id_donacion:d.id_donacion,error:error.message});}
  }
  await writeFile(new URL('../docs/evidencias/presentacion-datos.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify({donaciones_agregadas:report.donaciones.length,seguimientos:report.seguimientos.length,pruebas_ocultadas:report.archivadas.length,rutas:report.rutas},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await pool.end();}
