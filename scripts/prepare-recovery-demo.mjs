import { pool, transaction, audit } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { composeAddress } from '../server/mappers.js';

// Cuenta aislada para probar la recuperación en la interfaz; no modifica las cuentas demo principales.
try {
  const hash = await hashPassword('PruebaCuenta2026!');
  await transaction(async client => {
    const user = (await client.query("SELECT * FROM usuarios WHERE correo = 'recovery.ui@realimenta.test'")).rows[0];
    if (user) return;
    const created = await client.query("INSERT INTO usuarios (nombres, correo, password_hash, telefono, rol, estado) VALUES ('Cuenta de recuperación de prueba', 'recovery.ui@realimenta.test', ?, '000000000', 'donante', 'activo')", [hash]);
    await client.query(`INSERT INTO donantes (id_usuario, nombre_establecimiento, responsable, departamento, provincia, distrito, direccion, latitud, longitud, estado_verificacion)
      VALUES (?, 'Cuenta aislada de pruebas de recuperación · DEMO', 'Cuenta de recuperación de prueba', 'Puno', 'Puno', 'Puno', ?, -15.8377634, -70.0280229, 'verificado')`,
      [created.insertId, composeAddress('Parque Pino, punto público de demostración', 'No representa una entidad ni una oferta real.')]);
    await audit(client, created.insertId, 'usuarios', created.insertId, 'semilla_recuperacion_ui', { cuenta_aislada: true });
  });
  console.log('Cuenta recovery.ui@realimenta.test preparada; no se modificaron las cuentas demo principales.');
} catch (error) { console.error('No se pudo preparar la cuenta de recuperación:', error.code || '', error.message); process.exitCode = 1; }
finally { await pool.end(); }
