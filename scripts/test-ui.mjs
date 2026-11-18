// Pruebas de navegador (Playwright) sobre una base MariaDB temporal: nunca escriben en la base `realimenta`.
// Levanta la base aislada, carga las cuentas de demostración, inicia la aplicación en un puerto libre y
// ejecuta `playwright test` contra ella. Uso: npm run test:ui [-- archivo.spec.mjs]
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import { startSandbox } from '../tests/helpers/mysql-sandbox.mjs';

const freePort = () => new Promise(resolve => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
process.env.APP_ORIGIN = origin;
process.env.PORT = String(port);
const sandbox = await startSandbox();
let server, pool, code = 1;
try {
  await promisify(execFile)(process.execPath, ['scripts/seed.mjs'], { env: { ...process.env } });
  // Cuenta aislada para la prueba de recuperación de contraseña.
  await promisify(execFile)(process.execPath, ['scripts/prepare-recovery-demo.mjs'], { env: { ...process.env } });
  const { createApp } = await import('../server/app.js');
  ({ pool } = await import('../server/db.js'));
  server = createApp().listen(port, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  console.log(`Aplicación de prueba en ${origin} (base temporal).`);
  code = await new Promise(resolve => {
    const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, UI_BASE_URL: origin } });
    child.on('exit', resolve);
  });
} finally {
  server?.close(); await pool?.end().catch(() => {}); await sandbox.stop();
  process.exitCode = code;
}
