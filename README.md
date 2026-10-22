# REAlimenta 2.0

MVP académico del curso **Taller de Desarrollo de Software**, orientado inicialmente a Puno, Perú. Conecta establecimientos donantes con organizaciones beneficiarias y conserva el frontend HTML, CSS y JavaScript del proyecto original.

La versión incorpora Express, **MySQL/MariaDB de XAMPP** (base existente `realimenta`), autenticación por roles, donaciones con fotografías reales, solicitudes con asignación transaccional, seguimiento con cadena de custodia manual, recepción e incidencias. Hay mapas Leaflet, rutas reales de OSRM y comparación explícita de escenarios de tráfico. **59 pruebas de servidor/lógica aprobadas** contra una copia aislada de la estructura MySQL. La información alimentaria es declarada: el semáforo es logístico y temporal, no certifica inocuidad.

## Inicio rápido en Windows con XAMPP

Requisitos: XAMPP con MySQL/MariaDB iniciado, la base `realimenta` con sus 13 tablas ya creada en phpMyAdmin, Node.js 24 o superior con npm e internet para los servicios cartográficos.

Desde la carpeta del proyecto (`C:\xampp\htdocs\proyecto`):

```powershell
npm install
npm run db:check   # prueba de conexión y estructura, solo lectura
npm run db:seed    # cuentas de demostración (solo agrega; no sobrescribe registros existentes)
npm start
```

Abrir **http://127.0.0.1:3000**. La aplicación la sirve Node, no Apache: si se abre `http://localhost/proyecto/`, el `.htaccess` redirige a Node. No abrir los HTML con `file://` ni Live Server: los módulos necesitan el backend y su sesión del mismo origen.

`db:check` debe mostrar **"Conexión a MySQL establecida correctamente"** y 13/13 tablas. El servidor hace la misma verificación al iniciar y no arranca si falta una tabla o columna; nunca ejecuta `CREATE`, `ALTER` ni `DROP`. En desarrollo también existe `GET /api/dev/conexion`, que responde el mismo mensaje sin revelar contraseña, usuario ni versión del servidor.

Detalles del mapeo de columnas, fotografías, sesiones y decisiones de diseño: [Configuración MySQL](docs/Configuracion_MySQL.md).

La interfaz utiliza tres [fondos locales nuevos y degradados](docs/Fondos_locales_y_seguimiento.md). La evaluación distingue la ida de la organización al punto de recojo del traslado del alimento al destino, conserva el tráfico elegido al reabrir y abre el seguimiento correcto al aceptar una solicitud. No se agregaron tablas ni columnas.

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
| `ROUTING_PROVIDER` | `osrm` por defecto; `ors` para OpenRouteService. |
| `OSRM_URL` | Predeterminado `https://router.project-osrm.org`. |
| `ORS_API_KEY` | Clave privada OpenRouteService, solo backend. |
| `GEOCODING_URL` | Predeterminado `https://nominatim.openstreetmap.org`. |
| `MAP_USER_AGENT` | Identificación del proyecto ante el proveedor; usar identificación/contacto propios al desplegar. |
| `LOGISTICS_*` | Tiempos demostrativos de preparación, recojo, entrega, margen y umbral verde. |

Los parámetros logísticos son demostrativos, no reglas sanitarias. Las fechas viajan en la API con zona explícita y se guardan en hora de Lima (`America/Lima`, UTC-5).

## Fotografías de donaciones

Al publicar o editar una donación, el donante selecciona **hasta 5 fotos JPG, JPEG, PNG o WebP de máximo 5 MB cada una** y ve una vista previa. Al pulsar **Publicar donación** se guarda la donación en `donaciones`, se obtiene su ID y luego se envía cada foto. El servidor detecta el tipo real por la firma binaria (no confía en la extensión), rechaza SVG, GIF, ejecutables y documentos, elimina metadatos (EXIF/GPS), guarda el archivo como `uploads/donaciones/donacion_<id>_<aleatorio>.webp` y registra en `donacion_fotos` el nombre original, el nombre generado, la ruta relativa, el tipo MIME, el tamaño y si es la principal. Si MySQL o el disco fallan, no quedan archivos huérfanos ni registros parciales. Las fotos se muestran en Mis donaciones, en el catálogo y en el detalle, siempre desde MySQL, y solo a usuarios autorizados mediante `/media/donaciones/...`; Apache no puede servir ni ejecutar nada de `uploads/`.

## Cuentas de demostración

Contraseña pública y exclusiva de prueba para las cuatro cuentas: **`Realimenta2026!`**.

| Correo | Rol |
| --- | --- |
| `donante@realimenta.test` | Donante |
| `organizacion@realimenta.test` | Organización beneficiaria |
| `organizacion2@realimenta.test` | Segunda organización para comparar/concurrencia |
| `admin@realimenta.test` | Administrador |

Son perfiles de semilla previamente verificados e identificados como demostración por el dominio reservado `.test`; no representan una verificación administrativa real. Sus ubicaciones son puntos públicos de Puno. `db:seed` es idempotente: si un correo ya existe, no lo modifica (`node scripts/seed.mjs --restablecer-demo` restaura la contraseña pública de las cuentas demo). El registro público crea usuarios con estado `pendiente` y perfil por verificar: pueden iniciar sesión, pero publicar o solicitar requiere `estado_verificacion = 'verificado'`, que por ahora se asigna desde phpMyAdmin. No desplegar estas cuentas con su contraseña conocida.

`npm run demo:preparar` agrega escenarios ficticios de catálogo y custodia, y `npm run demo:vigente` un caso con plazo corto; ambos escriben registros de demostración en la base configurada.

## Mapas y proveedores

Leaflet se sirve localmente. OpenStreetMap aporta cartografía con atribución. Nominatim se consulta mediante backend al pulsar buscar; el usuario confirma o ajusta el marcador si la dirección es ambigua. No enviar nombres, correos ni datos confidenciales en la búsqueda.

El Nominatim público exige su [política oficial](https://operations.osmfoundation.org/policies/nominatim/): máximo absoluto de una petición por segundo para toda la aplicación, identificación válida, atribución, caché y ausencia de autocompletado/búsquedas masivas. El backend serializa consultas con separación de 1,1 segundos, caché y límite de 10 búsquedas/minuto por IP. Es configuración académica de una sola instancia; varias instancias requieren limitador compartido o proveedor propio/contratado.

El proveedor inicial de rutas es **OSRM público**, sin API key. Se consulta `/route/v1/driving` con GeoJSON y se convierten metros a kilómetros y segundos a minutos, según la [API oficial](https://project-osrm.org/docs/v5.24.0/api/). También se aplica cola de bajo volumen, caché y separación de 1,1 segundos entre consultas de rutas. El servicio público no ofrece disponibilidad garantizada: usar un proveedor/servidor adecuado para producción.

El resultado es una **estimación por carretera sin tráfico en vivo**. Cada evaluación se guarda en `evaluaciones_ruta` (distancia, tiempos, margen y semáforo); esa tabla no guarda la polilínea, por lo que el mapa se vuelve a dibujar con la ruta en caché o al pulsar **Calcular ruta y evaluar**. Un fallo, ausencia de ruta o respuesta inválida genera un mensaje y permite reintentar; no se reemplaza por una línea recta ni por tiempos ficticios.

### Alternativa OpenRouteService

1. Crear cuenta/iniciar sesión en el [portal oficial](https://openrouteservice.org/log-in/) y obtener una **API key de Directions** en el [dashboard](https://openrouteservice.org/dev/), revisando su cupo y condiciones.
2. En `.env` definir `ROUTING_PROVIDER=ors` y `ORS_API_KEY=su_clave_privada`. No guardar la clave en HTML, JS cliente ni Git.
3. Reiniciar backend, ingresar como organización, abrir donación y pulsar **Calcular ruta y evaluar**. Debe indicar proveedor `OpenRouteService`, distancia, duración y polilínea. La clave se envía desde backend como cabecera `Authorization`, conforme a su [API oficial](https://api.openrouteservice.org/).
4. Sin clave devuelve `503 CLAVE_RUTAS_PENDIENTE`; ante rechazo/fallo muestra error, sin simulación. Esta alternativa no se ha validado con una credencial privada en este entorno; la demostración comprobada utiliza OSRM.

## Recorrido para el docente

1. Ingresar como donante y publicar pan integral, 30 unidades, fechas futuras coherentes, punto confirmado en Puno y hasta 5 fotografías. Consultar detalle.
2. Cerrar sesión e ingresar como organización. Buscar la publicación en el catálogo y revisar condiciones, fotos y ubicación.
3. Calcular carretera, distancia, duración y semáforo. Enviar solicitud con responsable, teléfono, transporte, recipiente y fecha propuesta dentro de ventana.
4. Opcional: enviar otra desde la segunda organización.
5. Volver al donante, consultar las solicitudes recibidas y aceptar una: en una sola transacción la solicitud queda `aceptada`, las demás pendientes `rechazada`, la donación `en_proceso` y se registra la fila de `asignaciones`.
6. Ingresar como organización y comprobar estado. Consultar auditoría y reiniciar backend para observar persistencia. Revisar los registros en phpMyAdmin.
7. Seguir la [guía completa de 20 pasos](docs/DEMOSTRACION_REAlimenta.md) para el recorrido de custodia.

## Pruebas

```powershell
npm test
npm run test:ui
```

`npm test` **nunca usa la base `realimenta`**: cada suite levanta una instancia MariaDB temporal con los binarios de XAMPP (carpeta temporal y puerto libre), aplica la copia de estructura [`tests/fixtures/estructura_realimenta.sql`](tests/fixtures/estructura_realimenta.sql) y la elimina al terminar. Si XAMPP no está en `C:\xampp`, definir `MYSQL_BIN_DIR`. Resultado actual: **59/59 aprobadas**. Incluyen ida y traslado diferenciados, conservación de planificación, invalidación de rutas al cambiar coordenadas, fotografías (las cinco imágenes aportadas por el usuario, tipos, MIME real, 5 MB, 25 MP, máximo 5, portada, permisos y ausencia de huérfanos ante fallos de MySQL o disco), catálogo sin canceladas/finalizadas/expiradas, solicitudes, aceptación concurrente con `asignaciones` UNIQUE y rollback, custodia, incidencias, sesiones, recuperación, roles, CSRF e integridad referencial.

`test:ui` utiliza Playwright con Chrome instalado y requiere `npm start` en otra terminal; escribe registros de prueba en la base configurada y evidencias en `docs/evidencias/`. Definir `PLAYWRIGHT_CHROME_PATH` o `UI_BASE_URL` si cambian.

Las suites del backend se ejecutan secuencialmente para evitar interferencias entre instancias temporales de MariaDB en Windows; esto no cambia la concurrencia de la aplicación ni las pruebas de aceptación simultánea.

## Estructura

```text
index.html, login.html, registro.html        Páginas públicas
donante.html, organizacion.html,
administrador.html                         Paneles por rol
css/, js/, assets/                         Frontend
server/                                    Express, MySQL (db.js), auth, negocio, fotos, custodia, logística
uploads/donaciones/                        Fotografías subidas (fuera de Git, bloqueadas para Apache)
scripts/                                   Prueba de conexión, semillas y escenarios demo
tests/                                     API con MariaDB temporal, logística, proveedores, UI
db/migrations/                             Historial de la versión PostgreSQL (ya no se ejecuta)
docs/                                      Documentación y evidencias
.env                                       Configuración privada, fuera de Git
```

El servidor publica HTML/carpetas explícitos, no la raíz del proyecto ni `.env`, la estructura SQL o código backend. Los paneles autorizan por rol en servidor. Los documentos iniciales se conservan como antecedentes y pueden describir alcance futuro.

## Alcance y pendientes

Implementados y probados con MySQL: autenticación sobre `usuarios`, perfiles geográficos, donaciones, fotografías, catálogo, solicitudes, asignaciones transaccionales, auditoría, cálculo logístico, seguimiento, hitos de custodia, recepción e incidencias. Consultar [seguimiento y custodia](docs/Seguimiento_y_Custodia_REAlimenta.md) para criterios y guía de exposición.

Pendientes: aprobación documental de cuentas desde la interfaz, administración avanzada, uso de la tabla `notificaciones`, firmas digitales, GPS y sensores, exportación/reportes e impacto validado. Rendimiento bajo carga, disponibilidad, accesibilidad completa, respaldo/restauración y HTTPS requieren pruebas o infraestructura adicionales. Las fotografías y entidades de muestra no acreditan lotes ni entregas reales.

Documentos: [configuración MySQL](docs/Configuracion_MySQL.md), [diagnóstico](docs/Diagnostico_REAlimenta_2.md), [módulos](docs/Modulos_Funcionales_REAlimenta.md), [API](docs/API_REAlimenta.md), [RNF](docs/Requerimientos_No_Funcionales_REAlimenta.md), [demostración de 20 pasos](docs/DEMOSTRACION_REAlimenta.md) y [progreso](docs/PROGRESO_REAlimenta_2.md).
