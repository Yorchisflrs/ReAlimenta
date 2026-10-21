import { pool, transaction, audit } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

const password = 'Realimenta2026!';
const demoLocation = 'Ubicación demostrativa de punto público, no establecimiento real.';
// Puntos públicos reales, verificados mediante Nominatim y documentados en docs/evidencias/proveedores-reales.json.
// Ninguna cuenta representa a la institución o al comercio que opere cerca de estos puntos.
const accounts = [
  { correo: 'donante@realimenta.test', nombre: 'Donante de demostración', rol: 'donante', perfil: { nombre_establecimiento: 'Panadería San Carlos · DEMO', direccion: 'Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno', distrito: 'Puno', latitud: -15.840908, longitud: -70.0289581 } },
  { correo: 'organizacion@realimenta.test', nombre: 'Organización de demostración', rol: 'organizacion', perfil: { nombre: 'Comedor Esperanza · DEMO', responsable: 'Responsable de demostración', direccion: 'Punto público demostrativo: Parque Pino, Puno', distrito: 'Puno', latitud: -15.8377634, longitud: -70.0280229 } },
  { correo: 'organizacion2@realimenta.test', nombre: 'Segunda organización de demostración', rol: 'organizacion', perfil: { nombre: 'Red Solidaria · DEMO', responsable: 'Segundo responsable de demostración', direccion: 'Punto público demostrativo: Parque Pino, Puno (segunda cuenta de prueba)', distrito: 'Puno', latitud: -15.8377634, longitud: -70.0280229 } },
  { correo: 'admin@realimenta.test', nombre: 'Administrador de demostración', rol: 'administrador' }
];

try {
  const hash = await hashPassword(password);
  await transaction(async client => {
    for (const account of accounts) {
      const existing = (await client.query('SELECT * FROM usuario WHERE lower(correo)=$1', [account.correo])).rows[0];
      if (existing && !existing.es_demostracion) throw new Error(`El correo ${account.correo} pertenece a una cuenta no demostrativa; no se modificó.`);
      const user = existing || (await client.query(`INSERT INTO usuario(nombre,correo,hash_contrasena,telefono,rol,es_demostracion)
        VALUES($1,$2,$3,'000000000',$4,true) RETURNING *`, [account.nombre, account.correo, hash, account.rol])).rows[0];
      if (existing) await client.query('UPDATE usuario SET hash_contrasena=$2 WHERE id_usuario=$1', [user.id_usuario, hash]);
      if (account.perfil) {
        const entries = Object.entries({ ...account.perfil, departamento: 'Puno', provincia: 'Puno', referencia: demoLocation, ubicacion_confirmada: true, estado_verificacion: 'verificado' });
        await client.query(`INSERT INTO ${account.rol}(id_usuario,${entries.map(([key]) => key).join(',')})
          VALUES($1,${entries.map((_, i) => `$${i + 2}`).join(',')}) ON CONFLICT(id_usuario) DO NOTHING`, [user.id_usuario, ...entries.map(([, value]) => value)]);
        if (existing && process.argv.includes('--refresh-demo-locations')) {
          await client.query(`UPDATE ${account.rol} SET direccion=$2,latitud=$3,longitud=$4,referencia=$5,ubicacion_confirmada=true WHERE id_usuario=$1`,
            [user.id_usuario, account.perfil.direccion, account.perfil.latitud, account.perfil.longitud, demoLocation]);
        }
      }
      if (!existing) await audit(client, user.id_usuario, 'usuario', user.id_usuario, 'semilla_demostracion', { verificacion: 'Perfil de prueba previamente verificado por semilla; no constituye una verificación administrativa real.' });
    }
    const donor = (await client.query("SELECT d.* FROM donante d JOIN usuario u USING(id_usuario) WHERE u.correo='donante@realimenta.test'")).rows[0];
    if (process.argv.includes('--refresh-demo-locations')) {
      await client.query(`UPDATE donacion SET direccion_recojo=$2,latitud_recojo=$3,longitud_recojo=$4 WHERE id_donante=$1 AND descripcion LIKE '[DEMO:SEED:%'`,
        [donor.id_donante, donor.direccion, donor.latitud, donor.longitud]);
    }
    const items = [
      { marker: 'PAN', alimento: 'Pan integral · demostración', categoria: 'Panadería', cantidad: 30, unidad: 'unidades', description: 'Pan declarado por un donante ficticio. Solo para demostrar el flujo del MVP.', preservation: 'Mantener protegido en un lugar limpio y seco, según declaración de prueba.', cold: false, hours: 24 },
      { marker: 'FRUTAS', alimento: 'Manzanas y plátanos · demostración', categoria: 'Frutas y verduras', cantidad: 12, unidad: 'kg', description: 'Fruta de demostración. No representa alimentos disponibles en un establecimiento real.', preservation: 'Declaración de demostración: proteger de golpes y contaminación.', cold: false, hours: 36 },
      { marker: 'FRIO', alimento: 'Yogur envasado · demostración', categoria: 'Lácteos', cantidad: 18, unidad: 'unidades', description: 'Escenario de prueba con cadena de frío declarada. Sin certificación sanitaria.', preservation: 'Requiere medios de conservación refrigerada según declaración del donante; verificar condiciones antes de coordinar.', cold: true, hours: 12 }
    ];
    for (const item of items) {
      const marker = `[DEMO:SEED:${item.marker}]`;
      if ((await client.query('SELECT 1 FROM donacion WHERE id_donante=$1 AND descripcion LIKE $2', [donor.id_donante, `${marker}%`])).rowCount) continue;
      const donation = (await client.query(`INSERT INTO donacion(id_donante,alimento,categoria,cantidad,unidad,descripcion,
        fecha_disponibilidad,fecha_limite_recojo,fecha_limite_aprovechamiento_declarada,direccion_recojo,distrito,
        latitud_recojo,longitud_recojo,conservacion_declarada,requiere_cadena_frio,envase,observaciones)
        VALUES($1,$2,$3,$4,$5,$6,now()-interval '5 minutes',now()+$7*interval '1 hour',now()+($7+3)*interval '1 hour',
        $8,$9,$10,$11,$12,$13,'Envase de demostración declarado',$14) RETURNING id_donacion`,
        [donor.id_donante, item.alimento, item.categoria, item.cantidad, item.unidad, `${marker} ${item.description}`, item.hours,
          donor.direccion, donor.distrito, donor.latitud, donor.longitud, item.preservation, item.cold, demoLocation])).rows[0];
      await audit(client, donor.id_usuario, 'donacion', donation.id_donacion, 'semilla_demostracion', { marker, fechas: 'Relativas a la fecha real del servidor al ejecutar la semilla.' });
    }
  });
  console.log('Semillas de demostración preparadas de forma idempotente.');
  console.log('Cuentas .test: donante / organizacion / organizacion2 / admin @realimenta.test');
  console.log(`Contraseña pública y exclusiva de demostración: ${password}`);
  console.log('No usar estas cuentas ni esta contraseña pública en producción.');
} catch (error) { console.error('No se pudieron preparar semillas:', error.message); process.exitCode = 1; }
finally { await pool.end(); }
