// Migración aditiva, repetible y explícita para instalaciones MySQL anteriores.
// Antes de --apply se debe respaldar la base; el script nunca elimina registros ni tablas.
import { readFile } from 'node:fs/promises';
import { db, pool } from '../server/db.js';
import { inspectSchema } from '../server/schema.js';
import { CATALOG_TYPES } from '../server/catalogs.js';

const apply = process.argv.includes('--apply');
const expectedMissing = new Set(['catalogos', 'verificaciones', 'verificacion_documentos', 'recuperacion_contrasenas']);
async function column(table, name) {
  return (await db.query('SELECT COLUMN_TYPE AS tipo, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, name])).rows[0];
}
async function createFromFile(name, file) {
  const sql = await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8');
  const statement = sql.match(new RegExp('CREATE TABLE IF NOT EXISTS `'+name+'` \\([\\s\\S]*?;'))?.[0];
  if (!statement) throw new Error(`No se encontró la definición de ${name}.`);
  await db.query(statement);
}
async function addColumn(table, name, definition) {
  if (!await column(table, name)) { await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`); console.log(`Agregada ${table}.${name}`); }
}
async function addReview(table) {
  const info = await column(table, 'estado_verificacion');
  if (!info || !/^enum\((?:'[a-z_]+'(?:,|\)))+$/.test(info.tipo)) throw new Error(`El estado de ${table} tiene un formato inesperado.`);
  if (info.tipo.includes("'en_revision'")) return;
  const type = info.tipo.replace(/\)$/, ",'en_revision')");
  const nullable = info.nullable === 'NO' ? 'NOT NULL' : 'NULL';
  // MariaDB devuelve literales entre comillas en COLUMN_DEFAULT; MySQL puede devolverlos sin ellas.
  const rawDefault = info.def == null ? null : String(info.def);
  const defaultValue = rawDefault?.match(/^'([a-z_]+)'$/)?.[1] ?? rawDefault;
  if (defaultValue != null && !/^[a-z_]+$/.test(defaultValue)) throw new Error(`Valor predeterminado inesperado en ${table}.`);
  const defaultSql = defaultValue == null ? (info.nullable === 'NO' ? '' : ' DEFAULT NULL') : ` DEFAULT ${pool.escape(defaultValue)}`;
  await db.query(`ALTER TABLE \`${table}\` MODIFY COLUMN estado_verificacion ${type} ${nullable}${defaultSql}`);
  console.log(`Actualizado ${table}.estado_verificacion`);
}

try {
  const before = await inspectSchema(db);
  if (before.tablasFaltantes.some(t => !expectedMissing.has(t))) throw new Error('Faltan tablas esenciales; no se ejecutará la migración.');
  console.log(JSON.stringify({ modo: apply ? 'aplicar' : 'solo revisión', ...before }, null, 2));
  if (!apply) console.log('Para actualizar, realiza un respaldo y ejecuta: npm run db:migrate -- --apply');
  else {
    for (const table of ['usuarios','donantes','organizaciones','donaciones','solicitudes','entregas']) {
      const row = (await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``)).rows[0];
      console.log(`${table}: ${row.total} registros antes de migrar`);
    }
    const seedCatalogs = before.tablasFaltantes.includes('catalogos');
    await addReview('donantes'); await addReview('organizaciones');
    await addColumn('donantes', 'subsanacion_habilitada', 'tinyint(1) NOT NULL DEFAULT 0');
    await addColumn('organizaciones', 'codigo_registro', 'varchar(50) DEFAULT NULL');
    await addColumn('organizaciones', 'subsanacion_habilitada', 'tinyint(1) NOT NULL DEFAULT 0');
    await addColumn('donaciones', 'estado_alimento_declarado', 'varchar(50) DEFAULT NULL');
    await addColumn('donaciones', 'distrito_recojo', 'varchar(100) DEFAULT NULL');
    await addColumn('donaciones', 'borrador', 'tinyint(1) NOT NULL DEFAULT 0');
    await createFromFile('catalogos', 'actualizar_modulos_definitivos.sql');
    await createFromFile('verificaciones', 'actualizar_verificacion.sql');
    await createFromFile('verificacion_documentos', 'actualizar_verificacion.sql');
    await createFromFile('recuperacion_contrasenas', 'actualizar_recuperacion.sql');
    if (seedCatalogs) for (const [type, { defaults }] of Object.entries(CATALOG_TYPES)) {
      for (const [index, value] of defaults.entries()) await db.query('INSERT IGNORE INTO catalogos (tipo, valor, orden) VALUES (?, ?, ?)', [type, value, index + 1]);
    }
    const after = await inspectSchema(db);
    if (!after.ok) throw new Error(`La actualización quedó incompleta: ${JSON.stringify(after)}`);
    console.log('Estructura actualizada correctamente.');
    for (const table of ['usuarios','donantes','organizaciones','donaciones','solicitudes','entregas']) {
      const row = (await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``)).rows[0];
      console.log(`${table}: ${row.total} registros después de migrar`);
    }
  }
} finally { await pool.end(); }
