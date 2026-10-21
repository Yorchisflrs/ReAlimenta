import express,{Router} from 'express';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {pool,transaction,audit} from './db.js';
import {requireAuth,requireRole,requireVerified} from './auth.js';
import {id} from './validation.js';
import {fail} from './errors.js';

const directory=fileURLToPath(new URL('../.local/uploads/donaciones/',import.meta.url));
const MIME=new Set(['image/jpeg','image/png','image/webp']);
const fileName=/^[a-f0-9]{40}\.webp$/;
const uploads=new Map();
export const photosSQL=alias=>`COALESCE((SELECT jsonb_agg(jsonb_build_object('id_foto',f.id_foto,'url','/media/donaciones/'||f.archivo,'nombre',f.nombre_original,'ancho',f.ancho,'alto',f.alto) ORDER BY f.id_foto) FROM foto_donacion f WHERE f.id_donacion=${alias}.id_donacion),'[]'::jsonb)`;
async function canEdit(user,donationId,client=pool,lock=false){
  const d=(await client.query(`SELECT * FROM donacion WHERE id_donacion=$1 ${lock?'FOR UPDATE':''}`,[donationId])).rows[0];
  if(!d)fail(404,'DONATION_NOT_FOUND','No se encontró la donación.');
  if(d.id_donante!==user.perfil?.id_donante)fail(403,'NOT_OWNER','Solo el donante propietario puede subir fotografías.');
  if(d.estado!=='disponible'||Date.parse(d.fecha_limite_recojo)<=Date.now())fail(409,'PHOTO_STATE','Solo se pueden agregar fotos a una donación disponible con fechas vigentes.');
  if((await client.query("SELECT 1 FROM solicitud WHERE id_donacion=$1 AND estado IN ('pendiente','aceptada')",[donationId])).rowCount)fail(409,'PHOTO_REQUESTS','Las fotos no pueden cambiar después de recibir solicitudes activas.');
  return d;
}
export const photoRouter=Router();
photoRouter.post('/donaciones/:id/foto',requireAuth,requireRole('donante'),async(req,res,next)=>{
  requireVerified(req);await canEdit(req.user,id(req.params.id));
  const mime=(req.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!MIME.has(mime))fail(415,'PHOTO_TYPE','Selecciona una foto JPG, PNG o WebP. No se admiten SVG, GIF ni documentos.');
  const now=Date.now(),key=req.user.id_usuario;let entry=uploads.get(key);
  if(!entry||entry.until<now){entry={count:0,until:now+60000};uploads.set(key,entry);}
  if(++entry.count>15)fail(429,'PHOTO_RATE','Has realizado varias cargas. Espera un minuto antes de volver a intentarlo.');
  if(uploads.size>5000)for(const[k,v]of uploads)if(v.until<now)uploads.delete(k);
  next();
},express.raw({type:['image/jpeg','image/png','image/webp'],limit:'5mb'}),async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||!req.body.length)fail(422,'PHOTO_EMPTY','Selecciona una fotografía antes de subirla.');
  let result;
  try{
    const image=sharp(req.body,{limitInputPixels:25000000,failOn:'error',animated:false});
    const meta=await image.metadata();
    const expected={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'}[(req.get('content-type')||'').split(';')[0].trim().toLowerCase()];
    if(!['jpeg','png','webp'].includes(meta.format)||meta.format!==expected||Number(meta.pages||1)>1)fail(422,'PHOTO_INVALID','El contenido no corresponde a una fotografía admitida.');
    result=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer({resolveWithObject:true});
  }catch(error){if(error.code==='PHOTO_INVALID')throw error;fail(422,'PHOTO_INVALID','No se pudo leer la foto. Usa JPG, PNG o WebP válido, de hasta 5 MB y 25 megapíxeles.');}
  let original='fotografia';try{original=decodeURIComponent(req.get('x-file-name')||'fotografia').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,160)||'fotografia';}catch{fail(422,'PHOTO_NAME','El nombre del archivo no se pudo interpretar.');}
  const filename=`${randomBytes(20).toString('hex')}.webp`,destination=path.join(directory,filename);
  let written=false;
  try{
    const row=await transaction(async client=>{
      const d=await canEdit(req.user,id(req.params.id),client,true);
      if((await client.query('SELECT count(*)::int AS total FROM foto_donacion WHERE id_donacion=$1',[d.id_donacion])).rows[0].total>=3)fail(409,'PHOTO_LIMIT','Cada donación admite hasta 3 fotografías.');
      await mkdir(directory,{recursive:true});await writeFile(destination,result.data,{flag:'wx'});written=true;
      const f=(await client.query(`INSERT INTO foto_donacion(id_donacion,id_usuario,archivo,nombre_original,ancho,alto,bytes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id_foto,id_donacion,ancho,alto`,[d.id_donacion,req.user.id_usuario,filename,original,result.info.width,result.info.height,result.data.length])).rows[0];
      await audit(client,req.user.id_usuario,'donacion',d.id_donacion,'agregar_fotografia',{id_foto:f.id_foto,ancho:f.ancho,alto:f.alto});
      return {...f,url:`/media/donaciones/${filename}`};
    });
    res.status(201).json({data:row});
  }catch(error){if(written)await unlink(destination).catch(()=>{});throw error;}
});

export const mediaRouter=Router();
mediaRouter.use(requireAuth);
mediaRouter.get('/:archivo',async(req,res)=>{
  if(!fileName.test(req.params.archivo))fail(404,'PHOTO_NOT_FOUND','No se encontró la fotografía.');
  const row=(await pool.query(`SELECT d.*,dt.estado_verificacion,u.estado AS donante_estado FROM foto_donacion f JOIN donacion d USING(id_donacion) JOIN donante dt USING(id_donante) JOIN usuario u ON u.id_usuario=dt.id_usuario WHERE f.archivo=$1`,[req.params.archivo])).rows[0];
  if(!row)fail(404,'PHOTO_NOT_FOUND','No se encontró la fotografía.');
  if(req.user.rol==='donante'&&row.id_donante!==req.user.perfil?.id_donante)fail(404,'PHOTO_NOT_FOUND','No se encontró la fotografía.');
  if(req.user.rol==='organizacion'&&!(row.estado==='disponible'&&!row.ocultar_presentacion&&Date.parse(row.fecha_limite_recojo)>Date.now()&&row.estado_verificacion==='verificado'&&row.donante_estado==='activo')){
    if(!(await pool.query('SELECT 1 FROM solicitud WHERE id_donacion=$1 AND id_organizacion=$2',[row.id_donacion,req.user.perfil?.id_organizacion||-1])).rowCount)fail(404,'PHOTO_NOT_FOUND','No se encontró la fotografía.');
  }
  res.set({'Cache-Control':'private, no-cache','Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'});
  // Únicamente esta ruta autenticada puede leer el basename aleatorio validado en .local.
  res.sendFile(path.join(directory,req.params.archivo),{dotfiles:'allow'},error=>{if(error&&!res.headersSent)res.status(404).json({error:{code:'PHOTO_FILE_MISSING',message:'La fotografía no está disponible en el almacenamiento local.'}});});
});
