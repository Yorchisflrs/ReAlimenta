import { writeFile } from 'node:fs/promises';
import { db, pool, transaction, audit } from '../server/db.js';
import { hashPassword, userFromRow } from '../server/auth.js';
import { createTracking, evaluateTracking, getTracking, registerMilestone, reportIncident } from '../server/custody.js';
import { calculateRoute, evaluateLogistics, saveEvaluation } from '../server/logistics.js';
import { composeAddress, donationFromRow, COLD_CHAIN_MESSAGE } from '../server/mappers.js';

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
const iso = minutes => new Date(Date.now()+minutes*60000);
const at = minutes => new Date(meeting+minutes*60000);
const reference = 'Entidad ficticia; el punto público no implica afiliación ni oferta real.';
const report={fecha:now.toISOString(),datos:'Ficticios para presentación académica, sin ofertas ni eventos físicos reales.',puntos:points,donaciones:[],seguimientos:[],rutas:[],archivadas:[]};
const userByEmail = async correo => { const row = (await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo])).rows[0]; return row ? userFromRow(row) : null; };
try {
  const demo = Object.fromEntries(await Promise.all(['donante','organizacion','organizacion2','admin'].map(async name => [name, await userByEmail(`${name}@realimenta.test`)])));
  if (Object.values(demo).some(user => !user)) throw new Error('Ejecute primero npm run db:seed; no se encontraron las cuatro cuentas demostrativas.');
  const admin = demo.admin;
  const passwordHash = await hashPassword('Realimenta2026!');
  await transaction(async client => {
    // La segunda organización demo se ubica en Juliaca para mostrar una ruta interurbana.
    await client.query("UPDATE organizaciones SET nombre = 'Red Solidaria Juliaca · DEMO', direccion = ?, distrito = 'Juliaca', provincia = 'San Román', latitud = ?, longitud = ? WHERE id_usuario = ?",
      [composeAddress(points.juliaca.direccion, 'Ubicación demostrativa de punto público, no establecimiento real.'), points.juliaca.latitud, points.juliaca.longitud, demo.organizacion2.id_usuario]);
    await audit(client, admin.id_usuario, 'organizaciones', demo.organizacion2.perfil.id_organizacion, 'preparar_demo_juliaca', { punto_publico: true });
    const defs = [['cocina.universitaria','Cocina Universitaria del Lago · DEMO','universidad'],['huerta.solidaria','Huerta Solidaria · DEMO','mercado'],['despensa.juliaca','Despensa Andina Juliaca · DEMO','juliaca']];
    for (const [email, name, point] of defs) {
      const correo = `${email}@realimenta.test`;
      let userId = (await client.query('SELECT id_usuario FROM usuarios WHERE correo = ?', [correo])).rows[0]?.id_usuario;
      if (!userId) userId = (await client.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES (?, ?, ?, '000000000', 'donante', 'activo')", [name, correo, passwordHash])).insertId;
      if (!(await client.query('SELECT 1 FROM donantes WHERE id_usuario = ?', [userId])).rowCount) {
        const p = points[point];
        await client.query(`INSERT INTO donantes (id_usuario, nombre_establecimiento, responsable, departamento, provincia, distrito, direccion, latitud, longitud, estado_verificacion)
          VALUES (?, ?, ?, 'Puno', ?, ?, ?, ?, ?, 'verificado')`, [userId, name, name, p.distrito === 'Juliaca' ? 'San Román' : 'Puno', p.distrito, composeAddress(p.direccion, reference), p.latitud, p.longitud]);
      }
    }
  });
  const main = await userByEmail('donante@realimenta.test'), university = await userByEmail('cocina.universitaria@realimenta.test');
  const garden = await userByEmail('huerta.solidaria@realimenta.test'), jul = await userByEmail('despensa.juliaca@realimenta.test');
  const org = await userByEmail('organizacion@realimenta.test'), orgJ = await userByEmail('organizacion2@realimenta.test');
  const foods=[
    ['HOGAZAS','Hogazas artesanales del día','Panadería',24,'unidades','panaderia',main,'centro',false,30*60,'Hogazas enteras para distribuir en porciones.','Bolsas de papel cerradas; mantener protegido y seco.'],
    ['TOMATES','Tomates seleccionados para salsa','Verduras',15,'kg','hortalizas',garden,'mercado',false,36*60,'Tomates de maduración uniforme para coordinación con cocina.','Cajas limpias y ventiladas, sin apilar en exceso.'],
    ['ARROZ','Arroz envasado para despensa','Abarrotes',20,'kg','seco',main,'centro',false,7*24*60,'Bolsas selladas de producto seco. Revisar etiqueta y lote al recibir.','Envase original cerrado; lugar seco, sin humedad.'],
    ['CREMA','Crema de verduras · recojo coordinado','Alimentos preparados',25,'porciones','preparado',university,'universidad',true,24*60,'Escenario académico de preparación refrigerada. El donante define fecha y condiciones; no se infieren por categoría.','Conservación refrigerada declarada; contenedor alimentario con tapa y transporte apropiado.'],
    ['GALLETAS','Galletas artesanales de avena','Panadería',45,'unidades','panaderia',main,'centro',false,48*60,'Paquetes cerrados de galletas para distribución.','Proteger de humedad y contaminación; revisar ingredientes y alérgenos.'],
    ['FRUTA','Canastas de fruta de temporada','Frutas',10,'cajas','frutas',garden,'mercado',false,48*60,'Fruta entera de muestra: selección y verificación al recibir.','Canastas ventiladas, limpias y protegidas de golpes.'],
    ['VERDURAS','Hortalizas de la huerta','Verduras',18,'kg','hortalizas',garden,'mercado',false,36*60,'Selección variada de verduras para cocina comunitaria.','Cajas ventiladas, separar de sustancias contaminantes.'],
    ['LECHE','Leche en envase cerrado','Lácteos',24,'litros','refrigerado',jul,'juliaca',true,36*60,'Demostración de oferta interurbana. Revisar fecha de etiqueta, envase y conservación antes de aceptar.','Refrigeración declarada; traslado en contenedor térmico con control documentado.'],
    ['ENSALADA','Ensalada de verduras · coordinación local','Alimentos preparados',16,'porciones','preparado',university,'universidad',true,24*60,'Lote ilustrativo de preparación fría; la fotografía no acredita este lote.','Recipientes individuales con tapa, conservación refrigerada declarada.'],
    ['PANJUL','Pan de molde · ruta Juliaca–Puno','Panadería',36,'unidades','panaderia',jul,'juliaca',false,48*60,'Ejemplo interurbano con ruta real por carretera, sujeto a coordinación.','Bolsas cerradas en cajas limpias, protegidas de humedad.']
  ];
  async function addFood({key,name,category,quantity,unit,profile,donor,point,cold,deadline,description,preservation,available=iso(-5),pickup=iso(12*60),state='disponible'}) {
    const marker=`[DEMO:PRESENTACION:${key}]`;
    const found=(await db.query('SELECT * FROM donaciones WHERE descripcion LIKE ?',[`${marker}%`])).rows[0];
    if(found)return found;
    const p=points[point];
    return transaction(async client=>{
      const created=await client.query(`INSERT INTO donaciones (id_donante, nombre_alimento, categoria, cantidad, unidad, descripcion, estado_producto, fecha_disponibilidad, fecha_limite_recojo,
        fecha_limite_aprovechamiento, direccion_recojo, latitud, longitud, tipo_conservacion, requiere_cadena_frio, tipo_envase, observaciones, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Contenedor cerrado de demostración', ?, ?)`,
        [donor.perfil.id_donante,name,category,quantity,unit,`${marker} ${description}`,profile,available,pickup,deadline,p.direccion,p.latitud,p.longitud,cold?'Refrigerado':'Temperatura ambiente',cold,
          `${preservation} Datos ficticios para exposición académica; confirmar lote y condiciones reales antes de operar.`,state]);
      await client.query("INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, 'publicada', ?, 'Donación publicada por el escenario de presentación.')", [created.insertId, donor.id_usuario, donor.perfil.nombre_establecimiento.slice(0,150)]);
      await audit(client,admin.id_usuario,'donaciones',created.insertId,'semilla_presentacion',{key,punto_publico:true});
      return (await client.query('SELECT * FROM donaciones WHERE id_donacion = ?',[created.insertId])).rows[0];
    });
  }
  for(const [key,name,category,quantity,unit,profile,donor,point,cold,minutes,description,preservation] of foods){
    const d=await addFood({key,name,category,quantity,unit,profile,donor,point,cold,deadline:iso(minutes),description,preservation});
    report.donaciones.push({id:d.id_donacion,alimento:d.nombre_alimento});
  }
  const scenarios=[
    {key:'CUSTODIA_PAN',name:'Pan integral · entrega al Comedor Esperanza',category:'Panadería',quantity:30,unit:'unidades',profile:'panaderia',donor:main,point:'centro',cold:false,deadline:iso(24*60),stages:['listo','recogido','en_transito'],recipient:org},
    {key:'CUSTODIA_SALSA',name:'Salsa de tomate · coordinación universitaria',category:'Alimentos preparados',quantity:12,unit:'porciones',profile:'preparado',donor:main,point:'universidad',cold:true,deadline:at(55),available:at(-5),pickup:at(30),stages:[],recipient:org,proposed:at(0)},
    {key:'CUSTODIA_INTERURBANA',name:'Crema de verduras · evaluación Puno–Juliaca',category:'Alimentos preparados',quantity:20,unit:'porciones',profile:'preparado',donor:university,point:'universidad',cold:true,deadline:at(55),available:at(-5),pickup:at(30),stages:[],recipient:orgJ,proposed:at(0)},
    {key:'CUSTODIA_FRIO',name:'Yogur envasado · conservación en revisión',category:'Lácteos',quantity:18,unit:'unidades',profile:'refrigerado',donor:main,point:'centro',cold:true,deadline:iso(24*60),stages:['listo'],recipient:org,incident:true},
    {key:'CUSTODIA_RECIBIDA',name:'Canastas de fruta · recepción confirmada',category:'Frutas',quantity:8,unit:'cajas',profile:'frutas',donor:garden,point:'mercado',cold:false,deadline:iso(36*60),stages:['listo','recogido','en_transito','entregado','confirmado'],recipient:org}
  ];
  for(const scenario of scenarios){
    const d=await addFood({...scenario,state:'en_proceso',description:'Escenario ficticio de cadena de custodia para demostración; no representa una entrega ni un lote físico real.',preservation:scenario.cold?'Conservación refrigerada declarada; verificar antes de distribuir.':'Alimento protegido en envase cerrado según declaración de demostración.'});
    const tracking=await transaction(async client=>{
      let requestId=(await client.query("SELECT id_solicitud FROM solicitudes WHERE id_donacion = ? AND estado = 'aceptada'",[d.id_donacion])).rows[0]?.id_solicitud;
      if(!requestId){
        requestId=(await client.query(`INSERT INTO solicitudes (id_donacion, id_organizacion, cantidad_solicitada, responsable_recojo, telefono_recojo, fecha_recojo_propuesta, tipo_transporte, recipiente, mensaje, observaciones, estado)
          VALUES (?, ?, ?, 'Responsable logístico de demostración', '000000000', ?, 'Vehículo de coordinación académica', 'Contenedor cerrado de demostración', ?, 'Escenario ficticio, no una solicitud real.', 'aceptada')`,
          [d.id_donacion,scenario.recipient.perfil.id_organizacion,d.cantidad,scenario.proposed||iso(10),scenario.cold?COLD_CHAIN_MESSAGE:null])).insertId;
        await client.query('INSERT INTO asignaciones (id_donacion, id_solicitud) VALUES (?, ?)',[d.id_donacion,requestId]);
        await audit(client,admin.id_usuario,'solicitudes',requestId,'semilla_aceptacion',{escenario_ficticio:true});
      }
      const existing=(await client.query('SELECT id_entrega FROM entregas WHERE id_donacion = ?',[d.id_donacion])).rows[0];
      if(existing)return {id:existing.id_entrega,fresh:false};
      return {id:(await createTracking(client,requestId,scenario.donor.id_usuario)).id_entrega,fresh:true};
    });
    if(tracking.fresh){
      // Mismas reglas y validaciones que la API: orden de etapas, responsables y versión.
      for(const stage of scenario.stages){
        const actor=['listo','recogido'].includes(stage)?scenario.donor:scenario.recipient;
        const destination=['entregado','confirmado'].includes(stage);
        await transaction(async client=>{
          const t=await getTracking(actor,tracking.id,client);
          await registerMilestone(client,actor,tracking.id,{tipo:stage,version:t.version,responsable_entrega:scenario.donor.perfil.nombre_establecimiento.slice(0,150),
            responsable_recibe:destination?scenario.recipient.perfil.nombre:'Responsable logístico de demostración',lugar:destination?scenario.recipient.perfil.direccion:d.direccion_recojo,
            condicion_declarada:'sin_novedad',conserva_frio:scenario.cold?true:null,observacion:'Hito ficticio de demostración; no representa una verificación ni una entrega física real.'});
        });
      }
      if(scenario.incident)await transaction(client=>reportIncident(client,scenario.donor,tracking.id,{tipo:'temperatura',severidad:'alta',titulo:'Medición de conservación pendiente',descripcion:'Escenario ficticio: falta documentar la conservación antes de continuar. Requiere revisión del responsable; no autoriza distribuir el lote.'}));
    }
    report.seguimientos.push({id:tracking.id,alimento:d.nombre_alimento,etapa:scenario.stages.at(-1)||'preparacion'});
    try {
      const t=await getTracking(scenario.recipient,tracking.id);
      const evaluation=await evaluateTracking(t,scenario.recipient,{preparacion_min:10,recojo_min:10,entrega_min:5,margen_seguridad_min:15});
      report.rutas.push({id_donacion:d.id_donacion,distancia_km:evaluation.ruta.distancia_km,duracion_min:evaluation.ruta.duracion_estimada_min,puntos:evaluation.ruta.geometry.coordinates.length,semaforo:evaluation.evaluacion.estado_viabilidad});
    } catch(error){report.rutas.push({id_donacion:d.id_donacion,error:error.message});}
  }
  const catalog=(await db.query("SELECT d.*, dt.* FROM donaciones d JOIN donantes dt ON dt.id_donante = d.id_donante JOIN usuarios u ON u.id_usuario = dt.id_usuario WHERE u.correo LIKE '%@realimenta.test' AND d.estado = 'disponible'",[],{nestTables:true})).rows;
  for(const row of catalog){
    const d=donationFromRow(row.d,row.dt);
    try{
      const origin={latitud:d.latitud_recojo,longitud:d.longitud_recojo};
      const route=await calculateRoute(origin,org.perfil);
      const evaluation=evaluateLogistics(d,route,{preparacion_min:10,recojo_min:10,entrega_min:5,margen_seguridad_min:15});
      await saveEvaluation(db,{donationId:d.id_donacion,organizationId:org.perfil.id_organizacion,origin,destination:org.perfil,route,evaluation});
      report.rutas.push({id_donacion:d.id_donacion,distancia_km:route.distancia_km,duracion_min:route.duracion_estimada_min,puntos:route.geometry.coordinates.length});
    }catch(error){report.rutas.push({id_donacion:d.id_donacion,error:error.message});}
  }
  await writeFile(new URL('../docs/evidencias/presentacion-datos.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify({donaciones_agregadas:report.donaciones.length,seguimientos:report.seguimientos.length,rutas:report.rutas},null,2));
}catch(error){console.error(error.code||'',error.message);process.exitCode=1;}
finally{await pool.end();}
