import { pool, transaction, audit } from '../server/db.js';
import { hashPassword, isDemoEmail } from '../server/auth.js';
import { composeAddress } from '../server/mappers.js';

// Inserta cuentas y donaciones de demostración. Es idempotente y nunca sobrescribe registros existentes:
// si un correo ya existe, se conserva tal como está (use --restablecer-demo para volver a la contraseña pública).
const password = 'Realimenta2026!';
const demoLocation = 'Ubicación demostrativa de punto público, no establecimiento real.';
const resetDemo = process.argv.includes('--restablecer-demo');
// Puntos públicos reales, verificados mediante Nominatim y documentados en docs/evidencias/proveedores-reales.json.
// Ninguna cuenta representa a la institución o al comercio que opere cerca de estos puntos.
const accounts = [
  { correo: 'donante@realimenta.test', nombre: 'Donante de demostración', rol: 'donante', perfil: { nombre_establecimiento: 'Panadería San Carlos · DEMO', direccion: 'Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno', distrito: 'Puno', latitud: -15.840908, longitud: -70.0289581 } },
  { correo: 'organizacion@realimenta.test', nombre: 'Organización de demostración', rol: 'organizacion', perfil: { nombre: 'Comedor Esperanza · DEMO', responsable: 'Responsable de demostración', direccion: 'Punto público demostrativo: Parque Pino, Puno', distrito: 'Puno', latitud: -15.8377634, longitud: -70.0280229 } },
  { correo: 'organizacion2@realimenta.test', nombre: 'Segunda organización de demostración', rol: 'organizacion', perfil: { nombre: 'Red Solidaria · DEMO', responsable: 'Segundo responsable de demostración', direccion: 'Punto público demostrativo: Parque Pino, Puno (segunda cuenta de prueba)', distrito: 'Puno', latitud: -15.8377634, longitud: -70.0280229 } },
  { correo: 'admin@realimenta.test', nombre: 'Administrador de demostración', rol: 'administrador' }
];
const items = [
  { marker: 'PAN', alimento: 'Pan integral · demostración', categoria: 'Panadería', perfil: 'panaderia', cantidad: 30, unidad: 'unidades', description: 'Pan declarado por un donante ficticio. Solo para demostrar el flujo del MVP.', conservation: 'Temperatura ambiente', note: 'Mantener protegido en un lugar limpio y seco, según declaración de prueba.', cold: false, hours: 24 },
  { marker: 'FRUTAS', alimento: 'Manzanas y plátanos · demostración', categoria: 'Frutas', perfil: 'frutas', cantidad: 12, unidad: 'kg', description: 'Fruta de demostración. No representa alimentos disponibles en un establecimiento real.', conservation: 'Temperatura ambiente', note: 'Declaración de demostración: proteger de golpes y contaminación.', cold: false, hours: 36 },
  { marker: 'FRIO', alimento: 'Yogur envasado · demostración', categoria: 'Lácteos', perfil: 'refrigerado', cantidad: 18, unidad: 'unidades', description: 'Escenario de prueba con cadena de frío declarada. Sin certificación sanitaria.', conservation: 'Refrigerado', note: 'Requiere medios de conservación refrigerada según declaración del donante; verificar condiciones antes de coordinar.', cold: true, hours: 12 }
];

try {
  const hash = await hashPassword(password);
  const summary = { cuentas_creadas: 0, cuentas_existentes: 0, donaciones_creadas: 0 };
  await transaction(async client => {
    for (const account of accounts) {
      if (!isDemoEmail(account.correo)) throw new Error(`El correo ${account.correo} no pertenece al dominio de demostración.`);
      let user = (await client.query('SELECT * FROM usuarios WHERE correo = ?', [account.correo])).rows[0];
      if (user) {
        summary.cuentas_existentes++;
        if (resetDemo) await client.query("UPDATE usuarios SET password_hash = ?, estado = 'activo' WHERE id_usuario = ?", [hash, user.id_usuario]);
      } else {
        const created = await client.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES (?, ?, ?, '000000000', ?, 'activo')", [account.nombre, account.correo, hash, account.rol]);
        user = { id_usuario: created.insertId };
        summary.cuentas_creadas++;
        await audit(client, user.id_usuario, 'usuarios', user.id_usuario, 'semilla_demostracion', { verificacion: 'Perfil de prueba previamente verificado por semilla; no constituye una verificación administrativa real.' });
      }
      if (account.perfil) {
        const table = account.rol === 'donante' ? 'donantes' : 'organizaciones';
        if (!(await client.query(`SELECT 1 FROM ${table} WHERE id_usuario = ?`, [user.id_usuario])).rowCount) {
          const entries = Object.entries({ ...account.perfil, responsable: account.perfil.responsable || account.nombre, direccion: composeAddress(account.perfil.direccion, demoLocation).slice(0, 255), departamento: 'Puno', provincia: 'Puno', estado_verificacion: 'verificado' });
          await client.query(`INSERT INTO ${table} (id_usuario, ${entries.map(([key]) => key).join(', ')}) VALUES (?, ${entries.map(() => '?').join(', ')})`, [user.id_usuario, ...entries.map(([, value]) => value)]);
        }
      }
    }
    const donor = (await client.query("SELECT d.* FROM donantes d JOIN usuarios u ON u.id_usuario = d.id_usuario WHERE u.correo = 'donante@realimenta.test'")).rows[0];
    for (const item of items) {
      const marker = `[DEMO:SEED:${item.marker}]`;
      if ((await client.query('SELECT 1 FROM donaciones WHERE id_donante = ? AND descripcion LIKE ?', [donor.id_donante, `${marker}%`])).rowCount) continue;
      const created = await client.query(`INSERT INTO donaciones (id_donante, nombre_alimento, categoria, cantidad, unidad, descripcion, estado_producto,
        fecha_disponibilidad, fecha_limite_recojo, fecha_limite_aprovechamiento, direccion_recojo, latitud, longitud,
        tipo_conservacion, requiere_cadena_frio, tipo_envase, indicaciones_recojo, observaciones)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL 5 MINUTE, NOW() + INTERVAL ? HOUR, NOW() + INTERVAL ? HOUR, ?, ?, ?, ?, ?, 'Envase de demostración declarado', ?, ?)`,
        [donor.id_donante, item.alimento, item.categoria, item.cantidad, item.unidad, `${marker} ${item.description}`, item.perfil, item.hours, item.hours + 3,
          'Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno', donor.latitud, donor.longitud, item.conservation, item.cold, demoLocation, item.note]);
      await client.query("INSERT INTO seguimientos (id_donacion, id_usuario, etapa, responsable, observaciones) VALUES (?, ?, 'publicada', ?, 'Donación publicada por la semilla de demostración.')", [created.insertId, donor.id_usuario, donor.nombre_establecimiento.slice(0, 150)]);
      await audit(client, donor.id_usuario, 'donaciones', created.insertId, 'semilla_demostracion', { marker, fechas: 'Relativas a la fecha real del servidor al ejecutar la semilla.' });
      summary.donaciones_creadas++;
    }
  });
  console.log('Semillas de demostración preparadas de forma idempotente en MySQL.', JSON.stringify(summary));
  console.log('Cuentas .test: donante / organizacion / organizacion2 / admin @realimenta.test');
  console.log(`Contraseña pública y exclusiva de demostración: ${password}`);
  if (summary.cuentas_existentes && !resetDemo) console.log('Las cuentas que ya existían no se modificaron (use --restablecer-demo para restaurar su contraseña pública).');
  console.log('No usar estas cuentas ni esta contraseña pública en producción.');
} catch (error) { console.error('No se pudieron preparar semillas:', error.code || '', error.message); process.exitCode = 1; }
finally { await pool.end(); }
