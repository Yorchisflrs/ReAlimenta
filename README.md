# REAlimenta 2.0

MVP académico del curso **Taller de Desarrollo de Software**, orientado inicialmente a Puno, Perú. Conecta establecimientos donantes con organizaciones beneficiarias y conserva el frontend HTML, CSS y JavaScript del proyecto original.

La versión incorpora Express, **MySQL/MariaDB de XAMPP** (base existente `realimenta`), autenticación por roles, donaciones con fotografías reales, solicitudes con asignación transaccional, seguimiento con cadena de custodia manual, recepción e incidencias. Hay mapas Leaflet, rutas reales de OSRM y comparación explícita de escenarios de tráfico. Las pruebas usan una copia aislada de la estructura MySQL. La información alimentaria es declarada: el semáforo es logístico y temporal, no certifica inocuidad.

## Inicio rápido en Windows con XAMPP

Requisitos: XAMPP con MySQL/MariaDB iniciado, la base `realimenta` creada en phpMyAdmin, Node.js 24 o superior con npm e internet para los servicios cartográficos.

Desde la carpeta del proyecto (`C:\xampp\htdocs\proyecto`):

```powershell
npm install
npm run db:check   # prueba de conexión y estructura, solo lectura
npm start
```

Abrir **http://127.0.0.1:3000**. La aplicación la sirve Node, no Apache: si se abre `http://localhost/proyecto/`, el `.htaccess` redirige a Node. No abrir los HTML con `file://` ni Live Server: los módulos necesitan el backend y su sesión del mismo origen.

`db:check` debe mostrar **"Conexión a MySQL establecida correctamente"** y 17/17 tablas. El servidor hace la misma verificación al iniciar y no arranca si falta una tabla o columna; nunca ejecuta `CREATE`, `ALTER` ni `DROP`. En desarrollo también existe `GET /api/dev/conexion`, que responde el mismo mensaje sin revelar contraseña, usuario ni versión del servidor.

**Base existente:** primero respalda la base y luego ejecuta `npm run db:migrate` para revisar; después usa `npm run db:migrate -- --apply`. La migración añade únicamente las tablas y columnas que faltan y puede repetirse. Las sentencias de estructura de MySQL no son transaccionales: conserva el respaldo hasta verificar el resultado.

**Base nueva:** el archivo [db/realimenta_completa.sql](db/realimenta_completa.sql) incluye sentencias `DROP TABLE`; úsalo solo en una base nueva y nunca lo importes sobre datos que quieras conservar. Después ejecuta la migración anterior para agregar las mejoras recientes. `npm run db:seed` agrega cuentas demo de forma explícita.

Detalles del mapeo de columnas, fotografías, sesiones y decisiones de diseño: [Configuración MySQL](docs/Configuracion_MySQL.md).

La interfaz utiliza tres [fondos locales nuevos y degradados](docs/Fondos_locales_y_seguimiento.md).

## Configuración

Copiar [.env.example](.env.example) como `.env` si no existe. `.env` está fuera de Git y Apache tiene prohibido servirlo (`.htaccess`).

| Variable | Uso |
| --- | --- |
| `DB_HOST`, `DB_PORT` | Servidor MySQL de XAMPP, por defecto `127.0.0.1` y `3306`. |
| `DB_NAME` | Base existente, por defecto `realimenta`. |
| `DB_USER`, `DB_PASSWORD` | Por defecto `root` sin contraseña (valor inicial de XAMPP). Si la cambió en phpMyAdmin, escríbala aquí. |
| `SESSION_SECRET` | Clave aleatoria (64 hex) que firma las cookies de sesión. Obligatoria en producción. |
| `UPLOADS_DIR` | Carpeta de fotografías, por defecto `uploads/donaciones`. |
| `PORT`, `HOST` | Por defecto 3000 y 127.0.0.1. Si cambia `PORT`, actualice también las redirecciones de `.htaccess`. |
| `APP_ORIGIN` | Origen exacto, por ejemplo `http://127.0.0.1:3000`. |
| `NODE_ENV` | `development` local; `production` activa cookie Secure, exige `SESSION_SECRET` y desactiva la prueba de conexión. |
| `SESSION_HOURS` | Duración de sesión, por defecto 8 horas. |
| `DEMO_EMAIL_DOMAIN` | Dominio reservado de las cuentas demo, por defecto `realimenta.test`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE` | Correo opcional para recuperación de cuentas reales. Mantener credenciales exclusivamente en `.env`. |
| `GEOCODING_URL` | Predeterminado `https://nominatim.openstreetmap.org`. |
| `MAP_USER_AGENT` | Identificación del proyecto ante el proveedor; usar identificación/contacto propios al desplegar. |

Las fechas viajan en la API con zona explícita y se guardan en hora de Lima (`America/Lima`, UTC-5). Las rutas usan `ROUTING_PROVIDER=osrm` y `OSRM_URL`, o `ROUTING_PROVIDER=ors` con `ORS_API_KEY`.

La recuperación real requiere configurar SMTP en `.env`; sin esa configuración solo las cuentas demo pueden completar la simulación. El código real caduca en 10 minutos, es de un solo uso, se guarda como hash y se revocan las sesiones al cambiar la contraseña.

## Fotografías de donaciones

Al publicar o editar una donación, el donante selecciona **tres fotos obligatorias (frente, costado y cerca) y hasta dos opcionales, JPG, JPEG, PNG o WebP de máximo 5 MB cada una** y ve una vista previa. Al confirmar, la publicación nueva se guarda primero como borrador privado; solo aparece en el catálogo cuando termina la carga de las fotos obligatorias. Si la carga se interrumpe o se cierra la página, el donante puede abrir el borrador desde **Mis donaciones**, completar las fotos y publicarlo sin crear otro registro. El servidor detecta el tipo real por la firma binaria (no confía en la extensión), rechaza SVG, GIF, ejecutables y documentos, elimina metadatos (EXIF/GPS), guarda el archivo como `uploads/donaciones/donacion_<id>_<aleatorio>.webp` y registra en `donacion_fotos` el nombre original, el nombre generado, la ruta relativa, el tipo MIME, el tamaño y si es la principal. Si MySQL o el disco fallan, no quedan archivos huérfanos ni registros parciales. Las fotos se muestran en Mis donaciones, en el catálogo y en el detalle, siempre desde MySQL, y solo a usuarios autorizados mediante `/media/donaciones/...`; Apache no puede servir ni ejecutar nada de `uploads/`.

## Cuentas de demostración

Contraseña pública y exclusiva de prueba para las cuatro cuentas: **`Realimenta2026!`**.

| Correo | Rol |
| --- | --- |
| `donante@realimenta.test` | Donante |
| `organizacion@realimenta.test` | Organización beneficiaria |
| `organizacion2@realimenta.test` | Segunda organización para comparar/concurrencia |
| `admin@realimenta.test` | Administrador |

Son perfiles de semilla previamente verificados e identificados como demostración por el dominio reservado `.test`; no representan una verificación administrativa real. Sus ubicaciones son puntos públicos de Puno. `db:seed` es idempotente: si un correo ya existe, no lo modifica (`node scripts/seed.mjs --restablecer-demo` restaura la contraseña pública de las cuentas demo). El registro público crea usuarios con estado `pendiente` y perfil por verificar: pueden iniciar sesión, pero publicar o solicitar requiere que el administrador verifique la cuenta en **Cuentas y verificación**. No desplegar estas cuentas con su contraseña conocida.

`npm run demo:preparar` agrega escenarios ficticios de catálogo y custodia, y `npm run demo:vigente` un caso con plazo corto; ambos escriben registros de demostración en la base configurada.

`npm run demo:catalogo -- --apply` agrega diez publicaciones de productos locales y un recojo ficticio, todos identificados con **DEMO**. Solo inserta registros nuevos; no cambia publicaciones existentes ni renueva ejemplos vencidos. Una nueva ejecución crea ejemplos adicionales solo cuando los anteriores ya no están vigentes. Las fotografías de referencia y los plazos son ilustrativos y no representan alimentos reales.

## Mapas y proveedores

Leaflet se sirve localmente. OpenStreetMap aporta cartografía con atribución. Nominatim se consulta mediante backend al pulsar buscar; el usuario confirma o ajusta el marcador si la dirección es ambigua. No enviar nombres, correos ni datos confidenciales en la búsqueda.

El Nominatim público exige su [política oficial](https://operations.osmfoundation.org/policies/nominatim/): máximo absoluto de una petición por segundo para toda la aplicación, identificación válida, atribución, caché y ausencia de autocompletado/búsquedas masivas. El backend serializa consultas con separación de 1,1 segundos, caché y límite de 10 búsquedas/minuto por IP. Es configuración académica de una sola instancia; varias instancias requieren limitador compartido o proveedor propio/contratado.

La beneficiaria puede calcular dos trayectos por carretera: de su local al recojo y del donante a su local. El sistema compara el tiempo total con las fechas declaradas; el escenario de tráfico se elige manualmente y no es tráfico en vivo. Las evaluaciones se guardan en `evaluaciones_ruta`. La ruta requiere conexión al proveedor; si falla, no se inventa un recorrido. El semáforo no certifica la calidad ni la inocuidad del alimento.

## Recorrido para el docente

1. Ingresar como donante y publicar una donación con 3 fotos, fechas futuras, punto confirmado en Puno y la declaración de buen estado. Consultar detalle.
2. Ingresar como beneficiaria, buscar la publicación y enviarla indicando quién recoge y cuánto tardará. El donante recibe un aviso en la campana.
3. Como donante, aceptar la solicitud: las demás quedan rechazadas y avisadas, y ambas partes ven el teléfono (y WhatsApp) de la otra en **Recojos y entregas**.
4. Registrar los pasos: el donante marca **listo**, cualquiera de los dos registra **recogido** y la beneficiaria confirma **recibido** (o **recibido con problemas**, que crea una incidencia).
5. Si nadie recoge, el donante pulsa **No vinieron a recoger** (o la beneficiaria **No podremos recogerlo**): la donación vuelve a publicarse y se avisa a quienes la habían pedido.
6. Como administrador: abrir el **Expediente de verificación** de una cuenta nueva, adjuntar documentación de respaldo, registrar el código RUNOC/RUOS o corregir el RUC y aprobarla o rechazarla con motivo. Agregar un tipo de beneficiaria en **Listas del sistema** y revisar **Reportes de impacto** (con descarga CSV).
7. Copiar el código de verificación de un comprobante PDF (Ej. `D25-7KQ4`) y consultarlo en **Consultar código**.

Detalle de cada módulo, del código de verificación y del expediente: [Módulos definitivos](docs/Modulos_Definitivos_REAlimenta.md).

## Pruebas

```powershell
npm test
npm run test:ui
```

`npm test` **nunca usa la base `realimenta`**: cada suite levanta una instancia MariaDB temporal con los binarios de XAMPP (carpeta temporal y puerto libre), aplica la copia de estructura [`tests/fixtures/estructura_realimenta.sql`](tests/fixtures/estructura_realimenta.sql) y la elimina al terminar. Si XAMPP no está en `C:\xampp`, definir `MYSQL_BIN_DIR`. Se ejecutan contra una base temporal. Incluyen código de verificación, expediente con documentos, rechazo subsanable, edición administrativa, avisos, contacto entre las partes, recojo no realizado y reapertura, recepción con problemas, verificación y suspensión de cuentas, listas del sistema, reportes, consentimiento y declaración del donante, fotografías (las cinco imágenes aportadas por el usuario, tipos, MIME real, 5 MB, 25 MP, máximo 5, portada, permisos y ausencia de huérfanos ante fallos de MySQL o disco), catálogo sin canceladas/finalizadas/expiradas, solicitudes, aceptación concurrente con `asignaciones` UNIQUE y rollback, custodia, incidencias, sesiones, recuperación, roles, CSRF e integridad referencial.

`test:ui` ejecuta 10 recorridos en Chrome con Playwright: levanta la aplicación sobre una base MariaDB temporal (tampoco toca la base `realimenta`) y guarda evidencias en `docs/evidencias/`. Los resultados dependen de la ejecución local. Definir `PLAYWRIGHT_CHROME_PATH` si Chrome no está en la ruta habitual.

Las suites del backend se ejecutan secuencialmente para evitar interferencias entre instancias temporales de MariaDB en Windows; esto no cambia la concurrencia de la aplicación ni las pruebas de aceptación simultánea.

## Estructura

```text
index.html, login.html, registro.html        Páginas públicas
donante.html, organizacion.html,
administrador.html                         Paneles por rol
css/, js/, assets/                         Frontend
server/                                    Express, MySQL (db.js), auth, negocio, fotos, recojo, avisos, administración, verificación
uploads/                                   Fotos y documentos de verificación (fuera de Git, bloqueados para Apache)
scripts/                                   Prueba de conexión, semillas y escenarios demo
tests/                                     API y recorridos en Chrome, ambos con MariaDB temporal
db/migrations/                             Historial de la versión PostgreSQL (ya no se ejecuta)
docs/                                      Documentación y evidencias
.env                                       Configuración privada, fuera de Git
```

El servidor publica HTML/carpetas explícitos, no la raíz del proyecto ni `.env`, la estructura SQL o código backend. Los paneles autorizan por rol en servidor. Los documentos iniciales se conservan como antecedentes y pueden describir alcance futuro.

## Alcance y pendientes

Módulos: 1 Cuentas y perfil, 2 Donaciones y catálogo, 3 Solicitudes y asignación, 4 Recojo, recepción e incidencias, 5 Notificaciones, 6 Comprobantes y verificación, 7 Reportes de impacto y 8 Administración y verificación. Servicios de apoyo: mapas, auditoría, seguridad y base de datos.

Pendientes: configurar y verificar el proveedor SMTP en cada instalación, el medio (documento u otro) para comunicar las medidas del administrador, firmas digitales, GPS y sensores. Rendimiento bajo carga, disponibilidad, accesibilidad completa, respaldo/restauración y HTTPS requieren pruebas o infraestructura adicionales. Las fotografías y entidades de muestra no acreditan lotes ni entregas reales.

Documento vigente: [módulos definitivos](docs/Modulos_Definitivos_REAlimenta.md). Documentos históricos: [configuración MySQL](docs/Configuracion_MySQL.md), [diagnóstico](docs/Diagnostico_REAlimenta_2.md), [módulos](docs/Modulos_Funcionales_REAlimenta.md), [API](docs/API_REAlimenta.md), [RNF](docs/Requerimientos_No_Funcionales_REAlimenta.md), [demostración de 20 pasos](docs/DEMOSTRACION_REAlimenta.md) y [progreso](docs/PROGRESO_REAlimenta_2.md).
