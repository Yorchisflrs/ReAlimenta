import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import express from 'express';
import { startSandbox } from './helpers/mysql-sandbox.mjs';

let sandbox, db, pool, app, smtp, base, hashPassword;
const deliveries=[];
async function call(path, body) {
  const response=await fetch(`${base}/api/auth/recuperacion/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
}
before(async () => {
  sandbox=await startSandbox(); process.env.NODE_ENV='test';
  smtp=net.createServer(socket=>{
    let pending='', data=false, lines=[]; socket.write('220 localhost REAlimenta test\r\n');
    socket.on('data',chunk=>{
      pending+=chunk.toString(); let index;
      while((index=pending.indexOf('\r\n'))>=0){
        const line=pending.slice(0,index);pending=pending.slice(index+2);
        if(data){ if(line==='.') { deliveries.push(lines.join('\n'));lines=[];data=false;socket.write('250 Accepted\r\n'); } else lines.push(line); }
        else if(/^EHLO|^HELO/i.test(line))socket.write('250 localhost\r\n');
        else if(/^MAIL FROM|^RCPT TO/i.test(line))socket.write('250 OK\r\n');
        else if(/^DATA/i.test(line)){data=true;socket.write('354 End with dot\r\n');}
        else if(/^QUIT/i.test(line)){socket.write('221 Bye\r\n');socket.end();}
        else socket.write('250 OK\r\n');
      }
    });
  }).listen(0,'127.0.0.1'); await new Promise(r=>smtp.once('listening',r));
  Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),SMTP_SECURE:'false',SMTP_REQUIRE_TLS:'false',SMTP_FROM:'demo@localhost.test',SMTP_USER:'',SMTP_PASSWORD:''});
  ({db,pool}=await import('../server/db.js')); ({hashPassword}=await import('../server/auth.js'));
  const {recoveryRouter}=await import('../server/recovery.js'), {errorHandler}=await import('../server/errors.js');
  app=express();app.use(express.json());app.use('/api/auth',recoveryRouter);app.use(errorHandler);
  app=app.listen(0,'127.0.0.1');await new Promise(r=>app.once('listening',r));base=`http://127.0.0.1:${app.address().port}`;
});
after(async()=>{if(app)await new Promise(r=>app.close(r));if(smtp?.listening)await new Promise(r=>smtp.close(r));await pool?.end();await sandbox?.stop();});

test('Correo real: código solo al destinatario, hash persistido y uso único',async()=>{
  const old=await hashPassword('ClaveAnterior2026!');
  const user=await db.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES ('Persona Prueba', 'persona@real.example', ?, '951000000', 'donante', 'activo')",[old]);
  const response=await call('solicitar',{correo:'persona@real.example'});
  assert.equal(response.status,200);assert.equal(response.data.data.demo,undefined);
  assert.equal(deliveries.length,1);assert.match(deliveries[0],/persona@real\.example/);
  const code=deliveries[0].replace(/=\n/g,'').match(/\b[a-f0-9]{64}\b/)?.[0];assert.ok(code);
  assert.ok(!JSON.stringify(response.data).includes(code));
  const row=(await db.query('SELECT * FROM recuperacion_contrasenas WHERE id_usuario = ?',[user.insertId])).rows[0];
  assert.equal(row.token_hash.length,64);assert.notEqual(row.token_hash,code);
  const reset=await call('restablecer',{correo:'persona@real.example',codigo:code,contrasena:'ClaveNueva2026!'});
  assert.equal(reset.status,200);assert.equal((await call('restablecer',{correo:'persona@real.example',codigo:code,contrasena:'ClaveNueva2026!'})).status,400);
  assert.equal((await db.query('SELECT * FROM recuperacion_contrasenas WHERE id_usuario = ?',[user.insertId])).rowCount,0);
});

test('Correo real: cuentas suspendidas y administradores no reciben códigos',async()=>{
  const password=await hashPassword('ClaveAnterior2026!');
  await db.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES ('Prueba', 'suspendida@real.example', ?, '951000000', 'organizacion', 'suspendido'), ('Prueba', 'admin@real.example', ?, '951000000', 'administrador', 'activo')",[password,password]);
  const before=deliveries.length;
  const missing=await call('solicitar',{correo:'nadie@real.example'});
  assert.deepEqual((await call('solicitar',{correo:'suspendida@real.example'})).data,missing.data);
  assert.deepEqual((await call('solicitar',{correo:'admin@real.example'})).data,missing.data);
  assert.equal(deliveries.length,before);
});

test('Correo real: un envío fallido revoca el código y mantiene la respuesta genérica',async()=>{
  const password=await hashPassword('ClaveAnterior2026!');
  const user=await db.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES ('Prueba', 'fallo@real.example', ?, '951000000', 'donante', 'activo')",[password]);
  await new Promise(r=>smtp.close(r));
  const result=await call('solicitar',{correo:'fallo@real.example'});
  assert.equal(result.status,200);assert.equal(result.data.data.demo,undefined);
  assert.equal((await db.query('SELECT * FROM recuperacion_contrasenas WHERE id_usuario = ?',[user.insertId])).rowCount,0);
});
