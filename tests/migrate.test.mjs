import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startSandbox } from './helpers/mysql-sandbox.mjs';

const execute = promisify(execFile);
test('La migración agrega lo ausente, preserva datos y puede repetirse', async () => {
  const sandbox = await startSandbox();
  const conn = await sandbox.connect();
  try {
    // Solo se altera esta instancia temporal, nunca la base del usuario.
    await conn.query('DROP TABLE recuperacion_contrasenas, verificacion_documentos, verificaciones, catalogos');
    await conn.query('ALTER TABLE donaciones DROP COLUMN estado_alimento_declarado, DROP COLUMN distrito_recojo, DROP COLUMN borrador');
    await conn.query('ALTER TABLE donantes DROP COLUMN subsanacion_habilitada, MODIFY estado_verificacion enum(\'pendiente\',\'verificado\',\'rechazado\') DEFAULT \'pendiente\'');
    await conn.query('ALTER TABLE organizaciones DROP COLUMN codigo_registro, DROP COLUMN subsanacion_habilitada, MODIFY estado_verificacion enum(\'pendiente\',\'verificado\',\'rechazado\') DEFAULT \'pendiente\'');
    await conn.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES ('Persona prueba', 'migracion@example.test', 'hash', '951000000', 'donante', 'activo')");
    const run = () => execute(process.execPath, ['scripts/migrate.mjs', '--apply'], { env: { ...process.env } });
    await run(); await run();
    const [[{ total }]] = await conn.query("SELECT COUNT(*) AS total FROM usuarios WHERE correo = 'migracion@example.test'");
    assert.equal(total, 1);
    const [[{ tipo }]] = await conn.query("SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'donantes' AND COLUMN_NAME = 'estado_verificacion'");
    assert.match(tipo, /'en_revision'/);
    const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM catalogos');
    assert.ok(count > 0);
  } finally { await conn.end(); await sandbox.stop(); }
});
