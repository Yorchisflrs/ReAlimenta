import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startSandbox } from './helpers/mysql-sandbox.mjs';
const execute=promisify(execFile);

test('Catálogo de demostración solo agrega ejemplos identificados y es repetible',async()=>{
  const sandbox=await startSandbox();const conn=await sandbox.connect();
  try {
    await execute(process.execPath,['scripts/seed.mjs'],{env:{...process.env}});
    const [before]=await conn.query('SELECT id_organizacion,direccion,latitud,longitud FROM organizaciones ORDER BY id_organizacion');
    const run=()=>execute(process.execPath,['scripts/demo-catalogo.mjs','--apply'],{env:{...process.env}});
    await run();await run();
    const [after]=await conn.query('SELECT id_organizacion,direccion,latitud,longitud FROM organizaciones ORDER BY id_organizacion');
    assert.deepEqual(after,before);
    const [[row]]=await conn.query("SELECT COUNT(*) AS total, SUM(estado='disponible') AS disponibles, SUM(estado='en_proceso') AS asignadas FROM donaciones WHERE descripcion LIKE '[DEMO:CATALOGO:%'");
    assert.equal(row.total,11);assert.equal(Number(row.disponibles),10);assert.equal(Number(row.asignadas),1);
    const [[{ total }]]=await conn.query("SELECT COUNT(*) AS total FROM entregas e JOIN donaciones d ON d.id_donacion=e.id_donacion WHERE d.descripcion LIKE '[DEMO:CATALOGO:seguimiento]%'");
    assert.equal(total,1);
    await conn.query("UPDATE donaciones SET fecha_limite_recojo=NOW()-INTERVAL 1 MINUTE WHERE descripcion LIKE '[DEMO:CATALOGO:pan_integral]%'");
    await run();
    const [[renewed]]=await conn.query("SELECT COUNT(*) AS total, SUM(fecha_limite_recojo<NOW()) AS vencidas FROM donaciones WHERE descripcion LIKE '[DEMO:CATALOGO:pan_integral]%'");
    assert.equal(renewed.total,2);assert.equal(Number(renewed.vencidas),1);
  } finally {await conn.end();await sandbox.stop();}
});
