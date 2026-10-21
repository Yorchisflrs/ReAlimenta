# DEMOSTRACIÓN ACADÉMICA DE REAlimenta 2.0

Curso: Taller de Desarrollo de Software. Fecha de evidencia: 21 de octubre de 2026. Objetivo: demostrar dos módulos reales, gestión de donaciones y gestión de solicitudes, con PostgreSQL, autorización, carretera real y evaluación logística.

## Preparación

Desde la carpeta del proyecto, ejecutar `npm install`, `npm run db:start`, `npm run db:migrate`, `npm run db:seed` y `npm start`. Abrir `http://127.0.0.1:3000`; mantener la terminal del backend y PostgreSQL activos. Las consultas de mapa requieren internet. No usar Live Server ni abrir HTML como archivo.

| Cuenta | Correo | Contraseña pública de prueba |
| --- | --- | --- |
| Donante | `donante@realimenta.test` | `Realimenta2026!` |
| Organización | `organizacion@realimenta.test` | `Realimenta2026!` |
| Segunda organización | `organizacion2@realimenta.test` | `Realimenta2026!` |
| Administrador | `admin@realimenta.test` | `Realimenta2026!` |

Los perfiles están verificados por semilla exclusivamente para demostrar. No representan aprobaciones administrativas reales. Los puntos de prueba son Catedral de Puno y Parque Pino, ubicaciones públicas sin atribuir a esas instituciones la donación ficticia. No introducir datos sensibles en búsquedas del proveedor.

Para cada exposición crear una publicación nueva con fechas relativas al momento actual, por ejemplo: disponibilidad dentro de 2 minutos, límite de recojo dentro de 4 horas y aprovechamiento declarado dentro de 8 horas. El reloj del servidor valida las fechas. Anotar los nuevos identificadores como **D** (donación) y **S** (solicitud). Los ID históricos #9/#3 documentados abajo son evidencia de una ejecución aprobada, no ofertas permanentemente disponibles.

## Recorrido solicitado de 20 pasos

| Paso | Acción que realiza el expositor | Comprobación esperada |
| --- | --- | --- |
| 1 | En Inicio de sesión, elegir Donante e ingresar con la cuenta de prueba. | Abre `donante.html`; muestra nombre y rol del perfil. |
| 2 | Pulsar Publicar donación. Registrar Pan integral, 30 unidades, categoría Panadería, envase y conservación declarados, las tres fechas coherentes y el punto de recojo confirmado en Puno. Enviar. | Publicación guardada con identificador **D** y estado Disponible; el detalle conserva los datos enviados. |
| 3 | Consultar la fila de **D** en PostgreSQL con la consulta de solo lectura de la siguiente sección. Recargar la página y localizar la publicación en Mis donaciones. | La fila existe y sigue visible tras recarga; no depende de datos temporales del navegador. |
| 4 | Pulsar Cerrar sesión del donante. | Regresa al acceso; la sesión anterior queda eliminada en backend. |
| 5 | Iniciar sesión como `organizacion@realimenta.test`. | Abre el panel Organización con su ubicación registrada. |
| 6 | En Buscar donaciones, filtrar por el nombre de la publicación nueva. | Aparece **D** disponible. Si ya venció, crear otra con fechas vigentes; no alterar el reloj. |
| 7 | Abrir Ver detalles. | Muestra cantidad, disponibilidad, límites distintos de recojo/aprovechamiento, conservación, frío, envase y dirección. |
| 8 | Abrir Ver ruta de entrega o desplazarse al panel Evaluación del traslado. | El origen es el recojo y el destino es la organización; el mapa no presenta una imagen estática como ruta. |
| 9 | Revisar tiempos de preparación/recojo/entrega/margen, declarar medios de frío si corresponde y pulsar Calcular ruta y evaluar. | Se consulta OSRM real; muestra distancia, duración, proveedor, fecha y geometría por carretera. Sin tráfico en vivo. Si falla el proveedor, mostrar el error y reintentar; no inventar resultados. |
| 10 | Mostrar el semáforo y los valores de tiempo disponible, total y margen. | Con fechas suficientemente amplias se observa verde. Explicar que evalúa logística preliminar, no inocuidad ni certificación sanitaria. |
| 11 | Pulsar Solicitar donación. Registrar responsable, teléfono, vehículo, recipiente y hora propuesta futura dentro de la ventana; enviar. | Solicitud persistida **S**, estado Pendiente, visible en Mis solicitudes. Solicitar no reserva automáticamente la donación. |
| 12 | Cerrar sesión de la organización. | La sesión se elimina y se puede acceder de nuevo con otra cuenta. |
| 13 | Iniciar sesión de nuevo como donante. | Se recuperan los mismos registros persistidos del propietario. |
| 14 | Abrir Solicitudes y localizar **S**. Consultar organización, responsable, fecha, transporte/recipiente y Ver ruta de entrega. | La propuesta corresponde a **D** y muestra el destino correcto; no se presenta como aceptación automática. |
| 15 | Pulsar Aceptar solicitud y confirmar. | **S** pasa a Aceptada; **D** pasa a En proceso. Las otras solicitudes pendientes, si existen, quedan rechazadas en la misma transacción. |
| 16 | Consultar en PostgreSQL los estados de **D** y sus solicitudes con las consultas de abajo; consultar historial. | Como máximo una aceptada y eventos de decisión auditados. La concurrencia y el rechazo de otras se acreditan además en la suite API. |
| 17 | Cerrar sesión del donante e iniciar como organización. | Se identifica nuevamente al solicitante, sin reutilizar un rol anterior. |
| 18 | Abrir Mis solicitudes y comprobar **S**. Recargar. | Sigue Aceptada; la publicación no vuelve a Disponible por recargar. |
| 19 | Abrir localmente `docs/Requerimientos_No_Funcionales_REAlimenta.md` o su Word `.docx`. | Mostrar códigos, métricas/criterios, evidencia y límites; los objetivos no medidos no se presentan como cumplidos. |
| 20 | Mostrar los reportes de prueba o ejecutar las pruebas indicadas abajo. | 32/32 API/lógica (custodia-servidor.tap) y pruebas UI en la evidencia registrada; identificar fecha, ambiente y cobertura exacta. |

Los documentos se abren desde el repositorio/Explorador/Word. El servidor no publica la carpeta `docs`, ni credenciales, ni código backend como archivos estáticos.

## Consultas PostgreSQL de solo lectura

Usar el identificador **D** recién obtenido en lugar de `9`. Estas sentencias pueden ejecutarse en un cliente PostgreSQL conectado al mismo `.env`:

```sql
SELECT id_donacion, alimento, cantidad, unidad, estado,
       fecha_disponibilidad, fecha_limite_recojo,
       fecha_limite_aprovechamiento_declarada
FROM donacion WHERE id_donacion = 9;

SELECT id_solicitud, id_donacion, id_organizacion, estado,
       fecha_propuesta, motivo_decision
FROM solicitud WHERE id_donacion = 9
ORDER BY id_solicitud;

SELECT count(*) AS aceptadas
FROM solicitud WHERE id_donacion = 9 AND estado = 'aceptada';

SELECT id_evento, entidad, id_entidad, accion, fecha_evento
FROM auditoria
WHERE (entidad = 'donacion' AND id_entidad = 9)
   OR (entidad = 'solicitud' AND id_entidad IN
       (SELECT id_solicitud FROM solicitud WHERE id_donacion = 9))
ORDER BY id_evento;
```

El runtime portable no necesita incluir `psql`: también se puede comprobar la fila con Node desde PowerShell, sin imprimir `DATABASE_URL`. Reemplazar el `9` por **D**:

```powershell
@'
import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL });
console.table((await p.query('SELECT id_donacion,alimento,estado FROM donacion WHERE id_donacion=9')).rows);
await p.end();
'@ | node --input-type=module
```

Estas consultas no alteran registros. No revelar `.env` ni la contraseña de PostgreSQL durante la exposición.

## Evidencia existente y límites de lo demostrado

La ejecución UI **`mvhz8xmz`**, conservada en [ui-resumen.json](evidencias/ui-resumen.json), se realizó con Chrome del sistema y Playwright, entre `2026-10-21T10:36:32.013Z` y `2026-10-21T10:37:25.870Z` (05:36–05:37 de America/Lima).

| Evidencia histórica | Resultado verificable |
| --- | --- |
| Donación #9 / solicitud #3 | Publicada mediante formulario, recargada, encontrada por organización, solicitada, aceptada por donante y visible como aceptada tras recarga. |
| Ruta de donación #9 | OSRM real sin mocks: 1,258 km, 3 minutos, 23 puntos GeoJSON, verde, 6/6 teselas cargadas. La respuesta puede venir de caché del proveedor; se conserva su fecha de cálculo y no se presenta como tráfico en vivo. |
| Donación #10 / solicitud #4 | Edición a 17 unidades, cancelación de solicitud y cancelación de publicación con motivo. Modal probado mediante Tab/Escape y retorno del foco. |
| Donación #11 | Marcado almacenado en alimento/categoría se muestra como texto, cero elementos ejecutables y sin ejecución; registro cancelado tras la prueba. |
| Responsive 360 px | Landing, dashboard y listado con anchura documento/cuerpo de 360 px; menú móvil abre/cierra sin desbordamiento horizontal. |
| Diagnóstico del navegador | Cero errores JavaScript, cero errores de consola y cero respuestas API fallidas en los cuatro recorridos aprobados. |
| Comprobación manual Edge | Inicio y cierre de sesión comprobados; al cerrar vuelve a Inicio de sesión. |
| Suite API/PostgreSQL | 23 aprobadas: CRUD/estados/validación/roles/propiedad/CSRF, FK, duplicados, concurrencia 200/409, auditoría y reinicio real del proceso. |

La captura real independiente de geocodificación/ruta está en [proveedores-reales.json](evidencias/proveedores-reales.json). Su resultado puntual no es una constante ni una promesa de tiempo futuro. El rechazo está comprobado por API; esta ejecución no incluye una prueba específica del botón Rechazar en navegador. Amarillo/rojo/gris están cubiertos por pruebas de lógica; la ruta del recorrido visual comprobó verde. No se declara toda WCAG, todos los navegadores, carga p95, alta disponibilidad ni validación sanitaria.

## Repetir las pruebas

Con PostgreSQL iniciado:

```powershell
npm test
```

La suite API utiliza una base temporal aislada y necesita permiso `CREATEDB`; no borra registros de la base principal. El reporte disponible es [pruebas-unitarias-integracion.tap](evidencias/pruebas-unitarias-integracion.tap).

Mantener `npm start` en otra terminal y ejecutar:

```powershell
npm run test:ui
```

Chrome debe estar instalado. Si su ruta difiere, definir `PLAYWRIGHT_CHROME_PATH`; si cambia el origen, `UI_BASE_URL`. Esta suite UI crea registros de demostración reales y auditables en la base principal para verificar formularios. Conserva los necesarios como evidencia y cancela los de prueba de contenido. Los IDs de cada repetición serán distintos; revisar el nuevo `ui-resumen.json` y no sustituirlos por los históricos manualmente.

## Qué explicar al docente

Los dos módulos prioritarios realizan operaciones persistentes reales y tienen evidencia API/PG y recorridos de navegador. El mapa es cartografía OpenStreetMap y la ruta proviene de OSRM; son servicios distintos. Los demás módulos previstos continúan identificados como pendientes, entre ellos seguimiento/custodia/recepción, aprobación administrativa, notificaciones, incidencias y reportes. Los tiempos y colores permiten planificar, sin declarar que un alimento sea apto para consumo.
