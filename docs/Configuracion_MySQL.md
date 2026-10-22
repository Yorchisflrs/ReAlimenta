# Configuración MySQL de REAlimenta (XAMPP)

REAlimenta conserva su backend Node.js + Express y usa la base **existente** `realimenta` de MySQL/MariaDB de XAMPP (13 tablas creadas en phpMyAdmin). La aplicación **no crea, altera ni elimina** tablas: al iniciar solo consulta `INFORMATION_SCHEMA` para comprobar que existan las tablas y columnas que utiliza.

## Conexión

| Elemento | Detalle |
| --- | --- |
| Configuración | `.env` (fuera de Git; Apache lo bloquea con `.htaccess`): `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| Controlador | `mysql2/promise` con pool de conexiones ([server/db.js](../server/db.js)). |
| Consultas | Sentencias preparadas (`execute` con parámetros `?`); nunca se concatenan datos del usuario. |
| Codificación | `utf8mb4_unicode_ci`, igual que las tablas. |
| Sesión SQL | `time_zone = '-05:00'` (Lima), modo estricto (rechaza textos truncados o valores de `enum` inválidos) y `READ COMMITTED`. |
| Transacciones | `transaction()` hace `BEGIN`/`COMMIT` y `ROLLBACK` ante cualquier error; reintenta solo interbloqueos de InnoDB. |

Prueba de conexión:

- `npm run db:check`: muestra **"Conexión a MySQL establecida correctamente"**, verifica 13/13 tablas y cuenta registros (solo lectura).
- `GET /api/dev/conexion` (solo con `NODE_ENV` distinto de `production`): mismo mensaje en JSON, sin contraseña, usuario ni versión del servidor.
- `GET /api/health`: estado de la base para monitoreo.

### Evitar conectarse a la copia anterior

Tener MySQL iniciado no cambia un proceso Node que ya estaba ejecutándose. Antes de publicar, abrir `/api/health` en **el mismo puerto que usa el navegador**: la versión de XAMPP debe responder `mysql: true`. Si responde `postgres: true`, ese puerto todavía atiende la copia anterior y sus publicaciones no se están guardando en MySQL.

Cerrar la terminal del servidor anterior y ejecutar `npm start` desde `C:\xampp\htdocs\proyecto`. Si no se puede cerrar ese proceso, se puede usar temporalmente otro puerto libre, sin editar `.env`:

```powershell
$env:PORT = '3001'
$env:APP_ORIGIN = 'http://127.0.0.1:3001'
npm start
```

En ese caso, entrar directamente a `http://127.0.0.1:3001/login.html`, no mediante la redirección de Apache (que sigue apuntando al 3000). Iniciar sesión nuevamente: las sesiones de PostgreSQL no son sesiones MySQL. Este cambio de puerto **no migra ni elimina registros**; las donaciones de cada base siguen separadas.

Si la conexión falla, el servidor registra el código técnico en su consola (por ejemplo `ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, `ER_BAD_DB_ERROR`) y el navegador solo recibe un mensaje seguro (`DATABASE_UNAVAILABLE`).

## Mapeo entre el formulario y las tablas

La interfaz conserva sus nombres de campo; [server/mappers.js](../server/mappers.js) los traduce.

### donaciones

| Formulario / API | Columna MySQL |
| --- | --- |
| `alimento` | `nombre_alimento` |
| `categoria`, `descripcion`, `cantidad`, `unidad` | mismas columnas (`cantidad` admite 2 decimales) |
| `perfil_alimento` (Tipo de alimento) | `estado_producto` |
| `fecha_disponibilidad`, `fecha_limite_recojo` | mismas columnas |
| `fecha_limite_aprovechamiento_declarada` | `fecha_limite_aprovechamiento` |
| `direccion_recojo`, `latitud_recojo`, `longitud_recojo` | `direccion_recojo`, `latitud`, `longitud` |
| `referencia` | `indicaciones_recojo` |
| `conservacion_declarada` | `tipo_conservacion` (máx. 100) |
| `envase` | `tipo_envase` (máx. 100) |
| `requiere_cadena_frio`, `temperatura_declarada` (máx. 50), `observaciones` | mismas columnas |
| `distrito` | se toma de `donantes.distrito`; si el formulario indica otro, se agrega a `direccion_recojo` |
| `estado` | `disponible`, `en_proceso`, `finalizada`, `expirada`, `cancelada` |

`fecha_elaboracion`, `fecha_vencimiento` y `estado_envase` quedan en `NULL` porque el formulario actual no tiene esos campos. La foto referencial elegible se retiró del formulario porque la tabla no tiene dónde guardarla; la imagen de respaldo se deduce del nombre y la categoría.

### solicitudes

| Formulario / API | Columna MySQL |
| --- | --- |
| `responsable_recojo` | `responsable_recojo` (máx. 150) |
| `telefono` | `telefono_recojo` (máx. 20) |
| `fecha_propuesta` | `fecha_recojo_propuesta` |
| `transporte_declarado`, `recipiente_declarado` | `tipo_transporte`, `recipiente` (máx. 100) |
| `dispone_cadena_frio` | `mensaje` con la declaración fija de cadena de frío (o `NULL`) |
| cantidad completa de la donación | `cantidad_solicitada` |
| `fecha_creacion` | `fecha_solicitud` |
| `motivo_decision` | se lee del registro de `auditoria` de la decisión |

`solicitudes` tiene `UNIQUE (id_donacion, id_organizacion)`: si una organización vuelve a solicitar una donación cuya solicitud anterior fue rechazada o cancelada, se reutiliza la misma fila (queda `pendiente`) y la auditoría conserva el historial.

### usuarios, donantes y organizaciones

- El formulario tiene un solo campo de nombre: se guarda completo en `usuarios.nombres` (`apellidos` queda `NULL`); al mostrarlo se unen ambos.
- `password_hash` usa scrypt (`scrypt$16384$8$1$...`).
- El registro público deja `usuarios.estado` con su valor por defecto `pendiente`. `pendiente` y `activo` pueden iniciar sesión; `suspendido` no. Publicar o solicitar exige `estado_verificacion = 'verificado'` en el perfil.
- Las tablas de perfil no tienen columna de referencia: se conserva dentro de `direccion` con el separador ` · Ref.: ` y se separa al mostrarla. `responsable` se guarda en ambos perfiles.
- Las cuentas de demostración se reconocen por el dominio reservado `@realimenta.test`.

## Aceptación de solicitudes

`POST /api/solicitudes/:id/aceptar` ejecuta en una sola transacción:

1. Bloquea la donación (`SELECT ... FOR UPDATE`) y luego la solicitud.
2. Verifica que el usuario sea el donante propietario, que la solicitud pertenezca a la donación indicada (`id_donacion` enviado por la interfaz), que siga pendiente y que la donación siga disponible y sin asignación.
3. Marca la solicitud `aceptada` y rechaza las competidoras pendientes.
4. Cambia la donación a `en_proceso`.
5. Inserta la fila de `asignaciones`; su `UNIQUE (id_donacion)` impide una segunda asignación incluso con peticiones simultáneas.
6. Crea la entrega y el primer hito de custodia, y registra la auditoría.

Si cualquier paso falla, se hace `ROLLBACK` y no queda ningún cambio parcial.

## Fotografías

| Regla | Implementación |
| --- | --- |
| Formatos | JPG, JPEG, PNG y WebP, detectados por la firma binaria del archivo; SVG, GIF, ejecutables y documentos se rechazan. |
| Límites | 5 MB y 25 megapíxeles por imagen; máximo 5 por donación (control dentro de la transacción). |
| Archivo | Se recodifica a WebP (sin EXIF/GPS) en `uploads/donaciones/donacion_<id>_<16 hex>.webp`. |
| MySQL | `donacion_fotos`: `id_donacion`, `nombre_original`, `nombre_archivo`, `ruta_archivo` (relativa), `tipo_mime`, `tamano_bytes`, `es_principal` (la primera). No se guarda Base64. |
| Permisos | Solo el donante propietario y verificado sube fotos, y solo mientras la donación esté disponible y sin solicitudes activas. |
| Errores | Si falla MySQL o el disco, se borra el archivo escrito y la transacción se revierte. |
| Entrega | Las imágenes solo se sirven por `/media/donaciones/<archivo>` tras validar sesión y permiso. `uploads/.htaccess` niega todo acceso directo de Apache y desactiva PHP, CGI y demás manejadores. |

## Sin tablas de sesión ni de recuperación

El esquema no incluye tablas para sesiones ni códigos de recuperación, y no se agregaron:

- **Sesiones**: cookie `HttpOnly` firmada con HMAC (`SESSION_SECRET`) que contiene el usuario, el vencimiento y una huella de `password_hash`. En cada petición se vuelve a leer `usuarios`, así que suspender una cuenta o cambiar su contraseña invalida sus sesiones. El cierre de sesión revoca la cookie en memoria; tras reiniciar el servidor, una cookie cerrada copiada seguiría válida hasta su vencimiento (8 horas por defecto).
- **Recuperación demo**: el código de un solo uso se guarda (como hash) en memoria del servidor durante 10 minutos y queda ligado a la contraseña vigente. Reiniciar el servidor invalida los códigos pendientes. Solo aplica a cuentas `@realimenta.test` fuera de producción.

## Custodia e incidencias

| Concepto | Tabla |
| --- | --- |
| Entrega asignada (estado y responsables actuales, fechas de recojo, entrega y confirmación) | `entregas` |
| Hitos: aceptación, listo, recojo, traslado, entrega, confirmación y observaciones | `seguimientos` (`etapa`); también se registran `publicada` y `solicitud_recibida` |
| Problemas reportados | `incidencias` |
| Lugar, condición, temperatura, conservación de frío, severidad, título y resolución | `auditoria.descripcion` (JSON) del mismo evento |

Confirmar la recepción cambia la donación a `finalizada`. La aplicación nunca actualiza ni borra filas de `seguimientos`; las correcciones se agregan como observaciones. `evaluaciones_ruta` guarda distancia, tiempos, margen, semáforo y proveedor, pero no la polilínea: el mapa se redibuja con la ruta en caché o al recalcularla.

## Apache (XAMPP)

Como el proyecto está dentro de `htdocs`, el `.htaccess` de la raíz bloquea `.env`, carpetas ocultas, `server/`, `db/`, `scripts/`, `tests/`, `node_modules/`, `uploads/` y los `package*.json`, y redirige las páginas HTML a `http://127.0.0.1:3000`. CSS, JavaScript e imágenes públicas siguen accesibles.

## Pruebas

`npm test` no usa la base `realimenta`: cada suite crea una instancia MariaDB temporal con los binarios de XAMPP, aplica [tests/fixtures/estructura_realimenta.sql](../tests/fixtures/estructura_realimenta.sql) (copia de la estructura obtenida con `mysqldump --no-data`) y la elimina al terminar.

## Recomendación opcional (no aplicada)

Las consultas de custodia y decisiones filtran `auditoria` por `tabla_afectada` e `id_registro`. Con mucho historial, un índice en esas dos columnas aceleraría las pantallas. Es un cambio de estructura y por eso no se ejecutó; puede crearse desde phpMyAdmin si se decide.
