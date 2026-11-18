// Inserta solo ejemplos explícitamente ficticios. No actualiza ni elimina registros existentes.
// Uso: npm run demo:catalogo -- --apply. Las fechas son escenarios, no recomendaciones sanitarias.
import { db, pool, transaction, audit } from '../server/db.js';
import { createTracking } from '../server/custody.js';

const apply=process.argv.includes('--apply');
const points={
  puno:{direccion:'Entorno de la Catedral de Puno (punto público de demostración)',distrito:'Puno',lat:-15.840908,lon:-70.0289581},
  universidad:{direccion:'Av. Sesquicentenario, sector universitario de Puno (punto público de demostración)',distrito:'Puno',lat:-15.8268629,lon:-70.0141356},
  juliaca:{direccion:'Entorno de Plaza de Armas, Juliaca (punto público de demostración)',distrito:'Juliaca',lat:-15.4932157,lon:-70.1355925}
};
const examples=[
  ['pan_integral','Pan integral artesanal',50,'unidades','Panadería y complementos','panaderia','puno',false],
  ['pan_frances','Pan francés del día',36,'unidades','Panadería y complementos','panaderia','universidad',false],
  ['papa','Papa andina seleccionada',15,'kg','Verduras, tubérculos y frutas','hortalizas','puno',false],
  ['oca','Oca de temporada',12,'kg','Verduras, tubérculos y frutas','hortalizas','juliaca',false],
  ['queso','Queso fresco envasado',8,'kg','Lácteos y derivados','refrigerado','puno',true],
  ['frutas','Manzanas y peras',10,'kg','Verduras, tubérculos y frutas','frutas','universidad',false],
  ['verduras','Verduras para cocina comunitaria',14,'kg','Verduras, tubérculos y frutas','hortalizas','puno',false],
  ['quinua','Quinua en bolsas cerradas',20,'kg','Abarrotes y alimentos secos','seco','juliaca',false],
  ['trucha','Trucha refrigerada',12,'porciones','Carnes, pescados y huevos','refrigerado','puno',true],
  ['galletas','Galletas artesanales de avena',30,'unidades','Panadería y complementos','panaderia','universidad',false],
  ['seguimiento','Pan integral para seguimiento',25,'unidades','Panadería y complementos','panaderia','universidad',false]
];
try {
  if(!apply) console.log('Se prepararon 10 publicaciones ficticias y un recojo ficticio. Ejecuta con --apply para agregarlos.');
  else {
    const added=await transaction(async client=>{
      const donor=(await client.query("SELECT d.id_donante,d.nombre_establecimiento,d.estado_verificacion,u.id_usuario,u.estado FROM usuarios u JOIN donantes d ON d.id_usuario=u.id_usuario WHERE u.correo='donante@realimenta.test' FOR UPDATE")).rows[0];
      const org=(await client.query("SELECT o.id_organizacion,o.estado_verificacion,u.estado FROM usuarios u JOIN organizaciones o ON o.id_usuario=u.id_usuario WHERE u.correo='organizacion@realimenta.test'")).rows[0];
      if(!donor||!org||donor.estado_verificacion!=='verificado'||org.estado_verificacion!=='verificado'||!['activo','pendiente'].includes(donor.estado)||!['activo','pendiente'].includes(org.estado))throw new Error('Se necesitan las cuentas de demostración verificadas de donante y beneficiaria.');
      const now=Date.now(), from=new Date(now-5*60000), pickup=new Date(now+4*3600000), deadline=new Date(now+6*3600000), added=[];
      for(const [key,title,quantity,unit,category,profile,pointName,cold] of examples){
        const marker=`[DEMO:CATALOGO:${key}]`;
        if((await client.query("SELECT id_donacion FROM donaciones WHERE descripcion LIKE ? AND estado IN ('disponible','en_proceso') AND fecha_limite_recojo > NOW() LIMIT 1",[`${marker}%`])).rowCount)continue;
        const p=points[pointName], tracking=key==='seguimiento';
        const created=await client.query(`INSERT INTO donaciones (id_donante,nombre_alimento,categoria,cantidad,unidad,descripcion,estado_producto,estado_alimento_declarado,fecha_disponibilidad,fecha_limite_recojo,fecha_limite_aprovechamiento,direccion_recojo,distrito_recojo,latitud,longitud,tipo_conservacion,requiere_cadena_frio,tipo_envase,observaciones,estado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [donor.id_donante,`${title} · DEMO`,category,quantity,unit,`${marker} Ejemplo ficticio para presentar REAlimenta. No representa una oferta ni un lote real.`,profile,'sin_novedad',from,pickup,deadline,p.direccion,p.distrito,p.lat,p.lon,cold?'Refrigerado':'Temperatura ambiente',cold,'Envase de demostración','Datos y plazos ficticios. No acreditan la calidad ni conservación de alimentos reales.',tracking?'en_proceso':'disponible']);
        await client.query("INSERT INTO seguimientos (id_donacion,id_usuario,etapa,responsable,observaciones) VALUES (?,?,'publicada',?,'Ejemplo ficticio para demostración.')",[created.insertId,donor.id_usuario,donor.nombre_establecimiento.slice(0,150)]);
        await audit(client,donor.id_usuario,'donaciones',created.insertId,'crear_demo',{escenario_ficticio:true,clave:key});
        if(tracking){
          const request=await client.query("INSERT INTO solicitudes (id_donacion,id_organizacion,cantidad_solicitada,responsable_recojo,fecha_recojo_propuesta,tipo_transporte,recipiente,observaciones,estado,tiempo_llegada_min) VALUES (?,?,?,'Responsable de demostración',?,'Vehículo de demostración','Caja de demostración','Solicitud ficticia, no representa un recojo real.','aceptada',20)",[created.insertId,org.id_organizacion,quantity,new Date(now+30*60000)]);
          await client.query('INSERT INTO asignaciones (id_donacion,id_solicitud) VALUES (?,?)',[created.insertId,request.insertId]);
          await createTracking(client,request.insertId,donor.id_usuario);
        }
        added.push({alimento:`${title} · DEMO`,id:created.insertId,seguimiento:tracking});
      }
      return added;
    });
    console.log(JSON.stringify({agregados:added.length,datos:'Ejemplos ficticios etiquetados como DEMO',donaciones:added},null,2));
  }
} finally {await pool.end();}
