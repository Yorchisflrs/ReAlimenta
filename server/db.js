import mysql from 'mysql2/promise';
import { config } from './config.js';

// Cada conexión nueva usa hora de Lima (UTC-5, sin horario de verano), modo estricto para que MySQL
// rechace valores truncados o enum inválidos, y READ COMMITTED para que las lecturas posteriores a un
// SELECT ... FOR UPDATE vean los cambios ya confirmados por otras transacciones.
const SESSION_SETUP = [
  "SET SESSION time_zone = '-05:00'",
  "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
  'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED'
];

export const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  charset: 'utf8mb4_unicode_ci',
  timezone: '-05:00',
  decimalNumbers: true,
  supportBigNumbers: true,
  connectionLimit: config.database.connectionLimit,
  waitForConnections: true,
  connectTimeout: 5000,
  enableKeepAlive: true,
  // tinyint(1) representa verdadero/falso en el esquema (requiere_cadena_frio, es_principal, leida).
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      const value = field.string();
      return value === null ? null : value === '1';
    }
    return next();
  }
});
pool.on('connection', connection => {
  for (const sql of SESSION_SETUP) connection.query(sql, error => {
    if (error) console.error('No se pudo configurar la sesión MySQL:', error.code || error.message);
  });
});

function normalize([result]) {
  if (Array.isArray(result)) return { rows: result, rowCount: result.length };
  return { rows: [], rowCount: result.affectedRows, affectedRows: result.affectedRows, insertId: result.insertId };
}
// Todas las consultas usan sentencias preparadas (execute) con parámetros "?".
function client(target) {
  return {
    async query(sql, params = [], { nestTables = false } = {}) {
      return normalize(await target.execute(nestTables ? { sql, nestTables: true } : sql, params));
    }
  };
}
export const db = client(pool);

export async function transaction(callback, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const connection = await pool.getConnection();
    let reusable = true;
    try {
      await connection.beginTransaction();
      const result = await callback(client(connection));
      await connection.commit();
      return result;
    } catch (error) {
      try { await connection.rollback(); } catch { reusable = false; }
      // InnoDB revierte por completo la transacción elegida en un interbloqueo; repetirla es seguro.
      if (error.code === 'ER_LOCK_DEADLOCK' && attempt < retries) continue;
      throw error;
    } finally {
      if (reusable) connection.release(); else connection.destroy();
    }
  }
}

export const placeholders = values => values.map(() => '?').join(', ');

const MODULES = {
  usuarios: 'autenticacion', donantes: 'perfil', organizaciones: 'perfil', donaciones: 'donaciones',
  donacion_fotos: 'fotografias', solicitudes: 'solicitudes', asignaciones: 'solicitudes',
  entregas: 'custodia', seguimientos: 'custodia', incidencias: 'custodia', evaluaciones_ruta: 'logistica'
};
export async function audit(client, actor, table, id, action, detail = {}) {
  await client.query(`INSERT INTO auditoria (id_usuario, modulo, accion, tabla_afectada, id_registro, descripcion)
    VALUES (?, ?, ?, ?, ?, ?)`, [actor || null, MODULES[table] || table, action, table, id ?? null, JSON.stringify(detail)]);
}
