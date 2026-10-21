# REAlimenta 2.0

MVP académico del curso **Taller de Desarrollo de Software**, orientado inicialmente a Puno, Perú. Conecta establecimientos donantes con organizaciones beneficiarias y conserva el frontend HTML, CSS y JavaScript del proyecto original.

La versión incorpora Express, PostgreSQL real, autenticación por roles, donaciones, solicitudes, seguimiento con cadena de custodia manual, recepción e incidencias. El catálogo incluye fotografías locales y diez donaciones adicionales. Hay mapas Leaflet, rutas reales de OSRM y comparación explícita de escenarios de tráfico. **32 pruebas de servidor/lógica y 8 de navegador aprobadas** comprueban el alcance. La información alimentaria es declarada: el semáforo es logístico y temporal, no certifica inocuidad.

## Inicio rápido en Windows

Requisitos: Windows x64, Node.js 24 o superior con npm, PowerShell, `curl.exe`, `tar.exe` e internet para la primera descarga y los servicios cartográficos.

Desde la carpeta del proyecto:

```powershell
npm install
npm run db:start
npm run db:migrate
npm run db:seed
npm run demo:preparar
npm start
```

Abrir **http://127.0.0.1:3000**. No abrir los HTML con `file://` ni Live Server: los módulos funcionales necesitan el backend y su sesión del mismo origen.

`db:start` prepara PostgreSQL portable en `.local/`, verifica el SHA512 del paquete, inicializa una base real con autenticación SCRAM y escucha únicamente en `127.0.0.1:55432`. Si falta conexión configurada, genera una contraseña aleatoria y escribe `DATABASE_URL` en `.env`. Reutiliza la base y credencial existentes; no borra datos. La primera ejecución descarga el runtime y el puerto debe estar libre. Los scripts portables son específicos de Windows x64.

Detener la aplicación con Ctrl+C y PostgreSQL con:

```powershell
npm run db:stop
```

El siguiente arranque solo necesita `npm run db:start` y `npm start`; aplicar migraciones si cambia el esquema. Las semillas son idempotentes y sus fechas se calculan respecto al servidor al insertar. Si se ejecutan días después, las donaciones iniciales pueden haber vencido: publicar otra para la demostración.

## Configuración

Consultar [.env.example](.env.example). El entorno local preparado ya contiene `.env` con la conexión: no reemplazarlo con el ejemplo ni publicar su contraseña. Añadir opciones conservando `DATABASE_URL`.

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL real, generada por el script local. |
| `PORT`, `HOST` | Por defecto 3000 y 127.0.0.1. |
| `APP_ORIGIN` | Origen exacto, por ejemplo `http://127.0.0.1:3000`. |
| `NODE_ENV` | `development` local; `production` activa cookie Secure y requiere HTTPS para usarla. |
| `SESSION_HOURS` | Duración de sesión, por defecto 8 horas. |
| `ROUTING_PROVIDER` | `osrm` por defecto; `ors` para OpenRouteService. |
| `OSRM_URL` | Predeterminado `https://router.project-osrm.org`. |
| `ORS_API_KEY` | Clave privada OpenRouteService, solo backend. |
| `GEOCODING_URL` | Predeterminado `https://nominatim.openstreetmap.org`. |
| `MAP_USER_AGENT` | Identificación del proyecto ante el proveedor; usar identificación/contacto propios al desplegar. |
| `LOGISTICS_PREPARATION_MIN` | Preparación por defecto: 15 minutos en el ejemplo. |
| `LOGISTICS_PICKUP_MIN` | Recojo por defecto: 10 minutos en el ejemplo. |
| `LOGISTICS_DELIVERY_MIN` | Entrega por defecto: 10 minutos en el ejemplo. |
| `LOGISTICS_SAFETY_MIN` | Margen logístico: 15 minutos en el ejemplo. |
| `LOGISTICS_GREEN_MARGIN_MIN` | Umbral de margen verde: 30 minutos por defecto. |

Los parámetros logísticos son demostrativos, no reglas sanitarias. El formulario puede enviar tiempos específicos. Fechas API con zona explícita, almacenamiento `timestamptz` y presentación America/Lima.

Con un PostgreSQL instalado/externo, crear base y usuario, configurar `DATABASE_URL` y ejecutar `db:migrate`, `db:seed` y `start`. No ejecutar `db:start` contra un servidor externo: está limitado al entorno portable local. El usuario de pruebas necesita permiso `CREATEDB` para su base aislada temporal; una cuenta productiva no necesita ese permiso para operaciones normales.

## Cuentas de demostración

Contraseña pública y exclusiva de prueba para las cuatro cuentas: **`Realimenta2026!`**.

| Correo | Rol |
| --- | --- |
| `donante@realimenta.test` | Donante |
| `organizacion@realimenta.test` | Organización beneficiaria |
| `organizacion2@realimenta.test` | Segunda organización para comparar/concurrencia |
| `admin@realimenta.test` | Administrador |

Son perfiles de semilla previamente verificados e identificados como demostración; no representan una verificación administrativa real. Sus ubicaciones son puntos públicos de Puno: Catedral Basílica San Carlos Borromeo y Parque Pino. Los nombres son ficticios y no atribuyen donaciones a instituciones o negocios reales. Las acciones sí escriben registros persistentes de demostración. El registro público crea cuentas pendientes; la aprobación administrativa todavía no está implementada. No desplegar estas cuentas con su contraseña conocida.

## Mapas y proveedores

Leaflet se sirve localmente. OpenStreetMap aporta cartografía con atribución. Nominatim se consulta mediante backend al pulsar buscar; el usuario confirma o ajusta el marcador si la dirección es ambigua. No enviar nombres, correos ni datos confidenciales en la búsqueda.

El Nominatim público exige su [política oficial](https://operations.osmfoundation.org/policies/nominatim/): máximo absoluto de una petición por segundo para toda la aplicación, identificación válida, atribución, caché y ausencia de autocompletado/búsquedas masivas. El backend serializa consultas con separación de 1,1 segundos, caché y límite de 10 búsquedas/minuto por IP. Es configuración académica de una sola instancia; varias instancias requieren limitador compartido o proveedor propio/contratado.

El proveedor inicial de rutas es **OSRM público**, sin API key. Se consulta `/route/v1/driving` con GeoJSON y se convierten metros a kilómetros y segundos a minutos, según la [API oficial](https://project-osrm.org/docs/v5.24.0/api/). También se aplica cola de bajo volumen, caché y separación de 1,1 segundos entre consultas de rutas. El servicio público no ofrece disponibilidad garantizada: usar un proveedor/servidor adecuado para producción.

El resultado es una **estimación por carretera sin tráfico en vivo**. Se dibuja la geometría del proveedor. Un fallo, ausencia de ruta o respuesta inválida genera un mensaje y permite reintentar; no se reemplaza por una línea recta ni por tiempos ficticios. La evidencia [proveedores-reales.json](docs/evidencias/proveedores-reales.json) registró 1,258 km y 3 minutos entre los dos puntos públicos. Es una consulta concreta, no una constante del código ni garantía de resultados futuros.

### Alternativa OpenRouteService

1. Crear cuenta/iniciar sesión en el [portal oficial](https://openrouteservice.org/log-in/) y obtener una **API key de Directions** en el [dashboard](https://openrouteservice.org/dev/), revisando su cupo y condiciones.
2. En `.env` definir `ROUTING_PROVIDER=ors` y `ORS_API_KEY=su_clave_privada`. No guardar la clave en HTML, JS cliente ni Git.
3. Reiniciar backend, ingresar como organización, abrir donación y pulsar **Calcular ruta y evaluar**. Debe indicar proveedor `OpenRouteService`, distancia, duración y polilínea. La clave se envía desde backend como cabecera `Authorization`, conforme a su [API oficial](https://api.openrouteservice.org/).
4. Sin clave devuelve `503 CLAVE_RUTAS_PENDIENTE`; ante rechazo/fallo muestra error, sin simulación. Esta alternativa no se ha validado con una credencial privada en este entorno; la demostración comprobada utiliza OSRM.

## Recorrido para el docente

1. Ingresar como donante y publicar pan integral, 30 unidades, fechas futuras coherentes y punto confirmado en Puno. Consultar detalle.
2. Cerrar sesión e ingresar como organización. Buscar la publicación y revisar condiciones/ubicación.
3. Calcular carretera, distancia, duración y semáforo. Enviar solicitud con responsable, teléfono, transporte, recipiente y fecha propuesta dentro de ventana.
4. Opcional: enviar otra desde la segunda organización.
5. Volver al donante, consultar y comparar solicitudes/rutas, aceptar una: donación `en_proceso`, otras pendientes rechazadas en una transacción.
6. Ingresar como organización y comprobar estado. Consultar auditoría y reiniciar backend para observar persistencia.
7. Presentar documentos de módulos/RNF y pruebas. El recorrido principal ya pasó en Chrome/Playwright: donación #9 y solicitud #3 aceptada, ejecución `mvhz8xmz`. Seguir la [guía completa de 20 pasos](docs/DEMOSTRACION_REAlimenta.md) para repetirlo con una publicación nueva y fechas vigentes.

## Pruebas y evidencia

```powershell
npm test
npm run test:ui
```

`npm test` verifica API con **PostgreSQL real en una base temporal aislada**, cálculo logístico y errores controlados de proveedores. Crea `realimenta_test_<pid>_<aleatorio>` y elimina exclusivamente esa base al terminar. PostgreSQL debe estar iniciado y el usuario debe poder crear bases; los datos de `realimenta` se preservan.

Resultado actual: **32/32 aprobadas, 0 fallos y 0 omitidas**. Incluye aceptación única, integridad, roles/propiedad/CSRF, persistencia, secuencia y versión de custodia, responsables de transferencia, hitos SQL inmutables, incidencias y bloqueo de confirmación por prioridad alta. Evidencia: [reporte TAP actualizado](docs/evidencias/custodia-servidor.tap). La primera ejecución de 23 pruebas se conserva como antecedente. No acredita p95 ni disponibilidad productiva; los fallos externos controlados son pruebas, no sustitutos del proveedor real.

`test:ui` utiliza Playwright con Chrome instalado y requiere `npm start` en otra terminal. Definir `PLAYWRIGHT_CHROME_PATH` o `UI_BASE_URL` si cambian. **8/8 aprobadas**: cuatro recorridos originales y cuatro de catálogo fotográfico, mapa y tráfico, seis hitos con incidencia/resolución/recarga y móvil de 360 px sin desbordamiento. Ver [custodia UI](docs/evidencias/custodia-ui.json), [recorridos previos](docs/evidencias/ui-resumen.json) y [reporte conjunto](docs/evidencias/ui-playwright.json). Se esperan las teselas antes de capturar. No se acredita WCAG completa, todos los navegadores ni tráfico en vivo. Al finalizar ejecutar `node scripts/archive-ui-records.mjs`: conserva los registros técnicos sin mostrarlos en el catálogo.

## Estructura

```text
index.html, login.html, registro.html        Páginas públicas
donante.html, organizacion.html,
administrador.html                         Paneles por rol
css/, js/, assets/                         Frontend
server/                                    Express, auth, negocio, logística
db/migrations/                             SQL reproducible
scripts/                                   PostgreSQL, migraciones, semillas
tests/                                     API/PG, logística, proveedores
docs/                                      Documentación y evidencias
.local/                                    Runtime/datos PG local, fuera de Git
.env                                       Configuración privada, fuera de Git
```

El servidor publica HTML/carpetas explícitos, no la raíz del proyecto ni `.env`, migraciones o código backend. Los paneles autorizan por rol en servidor. Los documentos iniciales se conservan como antecedentes y pueden describir alcance futuro.

## Alcance y pendientes

Implementados y probados: autenticación, perfiles geográficos, donaciones, solicitudes, transacciones, auditoría, cálculo logístico, seguimiento, hitos de custodia, recepción e incidencias. En navegador se comprobaron publicación, recarga, ruta, solicitud, aceptación, edición, cancelación y cadena completa con resolución. Consultar [seguimiento y custodia](docs/Seguimiento_y_Custodia_REAlimenta.md) para criterios, API, evidencia y guía de exposición. El Word RNF inicial se conserva como línea base anterior; este documento y la ampliación describen el estado actual.

Seguimiento y custodia manual, recepción e incidencias ya están implementados. Pendientes: aprobación documental de cuentas, administración avanzada, firmas digitales, GPS y sensores, notificaciones, exportación/reportes e impacto validado. Rendimiento bajo carga, disponibilidad, accesibilidad completa, respaldo/restauración y HTTPS requieren pruebas o infraestructura adicionales. Las fotografías y entidades de muestra no acreditan lotes ni entregas reales.

Documentos: [diagnóstico](docs/Diagnostico_REAlimenta_2.md), [módulos](docs/Modulos_Funcionales_REAlimenta.md), [API](docs/API_REAlimenta.md), [RNF](docs/Requerimientos_No_Funcionales_REAlimenta.md), [demostración de 20 pasos](docs/DEMOSTRACION_REAlimenta.md) y [progreso](docs/PROGRESO_REAlimenta_2.md).
