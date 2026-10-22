import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';

// Instancia MariaDB temporal y aislada para las pruebas: binarios de XAMPP, carpeta temporal y puerto libre.
// Nunca se conecta al servidor MySQL principal (3306) ni a la base "realimenta" del usuario.
const execute = promisify(execFile);
const binDir = process.env.MYSQL_BIN_DIR || 'C:/xampp/mysql/bin';
const exe = name => path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);
const structure = fileURLToPath(new URL('../fixtures/estructura_realimenta.sql', import.meta.url));
export const SANDBOX_DATABASE = 'realimenta_prueba';

async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// mysql_install_db.exe falla si varias suites inicializan instancias a la vez: se serializa entre procesos.
async function exclusive(task) {
  const lock = path.join(os.tmpdir(), 'realimenta-mysql-sandbox.lock');
  let handle;
  for (let attempt = 0; !handle; attempt++) {
    try { handle = await open(lock, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST' || attempt > 1200) throw error;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 120000) await rm(lock, { force: true });
      await sleep(100);
    }
  }
  try { return await task(); } finally { await handle.close(); await rm(lock, { force: true }); }
}
async function install(datadir, port) {
  for (let attempt = 1; ; attempt++) {
    try { return await execute(exe('mysql_install_db'), [`--datadir=${datadir}`, `--port=${port}`, '--silent'], { windowsHide: true }); }
    catch (error) {
      await rm(datadir, { recursive: true, force: true });
      if (attempt >= 3) throw error;
      await sleep(500 * attempt);
    }
  }
}

export async function startSandbox() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'realimenta-mysql-'));
  const datadir = path.join(dir, 'data');
  let child, admin;
  try {
    const port = await exclusive(async () => {
      const free = await freePort();
      await install(datadir, free);
      child = spawn(exe('mysqld'), [`--defaults-file=${path.join(datadir, 'my.ini')}`, '--bind-address=127.0.0.1', '--skip-name-resolve', '--console'], { stdio: 'ignore', windowsHide: true });
      for (let attempt = 0; attempt < 80 && !admin; attempt++) {
        try { admin = await mysql.createConnection({ host: '127.0.0.1', port: free, user: 'root', password: '', multipleStatements: true }); }
        catch { await sleep(250); }
      }
      if (!admin) throw new Error('No se pudo iniciar la instancia MariaDB temporal de pruebas.');
      return free;
    });
    return await prepare(dir, datadir, port, child, admin);
  } catch (error) {
    await admin?.end().catch(() => {});
    child?.kill();
    await sleep(500);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function prepare(dir, datadir, port, child, admin) {
  // Comprobación defensiva: la conexión debe apuntar a la carpeta temporal recién creada.
  const [[{ datadir: actual }]] = await admin.query('SELECT @@datadir AS datadir');
  if (path.resolve(actual).toLowerCase() !== path.resolve(datadir).toLowerCase()) { await admin.end(); child.kill(); throw new Error('La instancia de prueba no es la carpeta temporal esperada.'); }
  await admin.query(`CREATE DATABASE ${SANDBOX_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`USE ${SANDBOX_DATABASE}`);
  await admin.query(await readFile(structure, 'utf8'));
  await admin.end();
  const uploads = path.join(dir, 'uploads');
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: SANDBOX_DATABASE, DB_USER: 'root', DB_PASSWORD: '',
    SESSION_SECRET: randomBytes(32).toString('hex'), UPLOADS_DIR: uploads
  });
  return {
    port, dir, uploads,
    connect: () => mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', database: SANDBOX_DATABASE, timezone: '-05:00', decimalNumbers: true }),
    async stop() {
      try { await execute(exe('mysqladmin'), ['-h127.0.0.1', `-P${port}`, '-uroot', 'shutdown'], { windowsHide: true }); } catch { child.kill(); }
      await new Promise(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', resolve); setTimeout(resolve, 10000); } });
      for (let attempt = 0; attempt < 10; attempt++) {
        try { await rm(dir, { recursive: true, force: true }); return; }
        catch { await new Promise(resolve => setTimeout(resolve, 300)); }
      }
    }
  };
}
