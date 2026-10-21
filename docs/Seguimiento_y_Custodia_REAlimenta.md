# Seguimiento y cadena de custodia de REAlimenta

Actualización funcional del 21 de octubre de 2026, preparada para la demostración académica en Puno. Amplía la versión documentada inicialmente con trazabilidad operativa registrada, recepción e incidencias. No constituye un sistema certificado de seguridad alimentaria.

## Qué se puede mostrar

El menú Seguimiento y custodia funciona para donante, organización y administración. Cada solicitud aceptada genera automáticamente un seguimiento. Se conservan las direcciones y coordenadas de origen y destino como instantáneas: modificar un perfil después no reescribe el acuerdo anterior.

El panel muestra mapa Leaflet con cartografía OpenStreetMap, dos marcadores A y B, geometría real de carretera de OSRM, distancia, duración base, demora manual por tráfico, margen logístico, plazo declarado del lote, semáforo, custodio y un historial con responsables y hora del servidor.

Los cinco escenarios de muestra están identificados como ficticios:

| Escenario | Recorrido | Qué demuestra |
| --- | --- | --- |
| Pan integral al Comedor Esperanza | Centro de Puno a Parque Pino | Recorrido local y cadena hasta traslado, con margen suficiente |
| Salsa de tomate | Sector universitario de Av. Sesquicentenario a Parque Pino | Ventana de coordinación y margen reducido alrededor del horario de demostración |
| Crema de verduras | Sector universitario de Puno a Juliaca | Duración interurbana incompatible con el plazo corto declarado del ejemplo |
| Yogur envasado | Centro de Puno a Parque Pino | Incidencia crítica por conservación pendiente, visible para administración |
| Canastas de fruta | Entorno de Mercado Central a Parque Pino | Historial completo hasta recepción confirmada |

Los colores se calculan con el reloj y condiciones actuales, no son valores fijos asociados al nombre del ejemplo. El escenario de salsa utiliza disponibilidad prevista a las 12:55 y plazo declarado a las 13:55, hora de Lima del día de preparación. Al transcurrir la ventana, puede pasar a rojo. Las rutas públicas no implican que esas instituciones donen o reciban alimentos.

## Estados y responsabilidades

Preparación → listo para recojo → recogido → en traslado → entrega registrada → recepción confirmada.

El donante o administración registran que está listo. El recojo identifica a quien entrega y quien recibe. La organización receptora o administración registran traslado, entrega y confirmación. Cada transferencia requiere los nombres de sus responsables. Cualquier participante puede agregar una observación o reportar una incidencia.

Los hitos se guardan en PostgreSQL con actor autenticado, rol, lugar, condición declarada, temperatura opcional, conservación de frío opcional, observación y fecha real del servidor. No se permiten saltos de etapa. La columna versión y el bloqueo transaccional rechazan cambios simultáneos obsoletos con 409. Un disparador SQL impide editar o borrar hitos: las correcciones se registran como observaciones nuevas.

Las entregas de demostración precargadas no son evidencia de operaciones físicas reales. Los hitos creados mediante formularios sí verifican el funcionamiento del registro, pero siguen siendo declaraciones humanas, no mediciones verificadas por sensores.

## Tiempo y semáforo

Tiempo total estimado = espera hasta disponibilidad o recojo propuesto + preparación pendiente + recojo pendiente + duración de carretera + demora de tráfico elegida + entrega + margen logístico.

Margen restante = minutos hasta el límite de aprovechamiento declarado − tiempo total estimado.

Después de registrar el recojo, no se vuelven a contar preparación ni recojo. Se mantiene el recorrido planificado completo como una estimación conservadora: no se inventa una ubicación intermedia ni un vehículo moviéndose. Tras registrar entrega/confirmación, el transporte pendiente es cero. La pantalla actualiza el cálculo cada minuto mientras está visible y no haya un diálogo abierto; el proveedor de rutas mantiene caché y su fecha original.

| Color | Criterio |
| --- | --- |
| Verde | Margen de al menos 30 minutos según configuración, sin condiciones de alerta conocidas |
| Amarillo | Margen positivo menor de 30 minutos, revisión declarada o incidencia abierta no crítica |
| Rojo | Plazo declarado superado, recojo fuera de ventana, falta declarada de medios de frío requeridos, no conformidad o incidencia crítica abierta |
| Gris | Faltan datos necesarios, por ejemplo límite declarado, ruta o declaración de conservación de frío |

Una hora disponible y una carretera estimada en tres horas producen rojo, aunque el tipo de alimento sea el mismo que otro lote. El programa no asigna una vida útil universal a pan, salsa, lácteos o platos preparados. El formulario permite indicar tipo y plazo específico del lote; un atajo en minutos completa fechas, pero no las convierte en una recomendación sanitaria.

La conservación segura depende de la elaboración, tiempo y temperatura, no solo de distancia o aspecto. Como referencia general, [USDA FSIS explica la relación entre conservación y manejo de sobrantes](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety). Esa guía no se presenta como validación local ni se usa para declarar automáticamente un alimento comestible. Los límites operativos deben validarse con profesionales competentes y las condiciones reales del lote.

## Tráfico y mapas reales

OSRM entrega distancia, duración y GeoJSON de carretera conforme a su [API oficial](https://project-osrm.org/docs/v5.24.0/api/). El proveedor público usado no proporciona aquí tráfico en vivo. El usuario puede comparar demora adicional de 0, 10, 25, 45, 90 o 180 minutos; son escenarios de planificación explícitos. No se publicitan como mediciones ni como pronósticos del tránsito.

Las coordenadas de Av. Sesquicentenario, entorno de Mercado Central y Plaza de Armas de Juliaca se comprobaron mediante Nominatim. La ruta universitaria a Juliaca devolvió aproximadamente 42,3 km y 44,6 minutos; Juliaca a Parque Pino aproximadamente 42,9 km y 54,4 minutos en la ejecución registrada. No son constantes del código ni tiempos garantizados. La evidencia está en `evidencias/presentacion-datos.json`.

No hay GPS, firma digital, termómetro conectado ni certificación sanitaria. La última ubicación es el lugar escrito por el responsable del hito. Las direcciones ambiguas se deben confirmar en el mapa antes de operaciones reales.

## Incidencias

Donante y organización consultan solo sus entregas; administración consulta la red. Una condición no conforme crea una incidencia crítica automáticamente. También se pueden reportar demora, temperatura/conservación, envase, calidad u otro problema.

La prioridad alta abierta activa rojo e impide confirmar la recepción, aunque se haya registrado la entrega. Solo administración puede registrar la resolución con explicación; la descripción original permanece. Resolver no modifica los hitos anteriores ni convierte el lote en apto para consumo.

## Catálogo de presentación

Se añadieron diez ofertas y cinco escenarios de seguimiento; el catálogo de la organización principal conserva trece ofertas disponibles antes de que venzan o se soliciten. Hay pan, galletas, fruta, verduras, arroz envasado, leche y preparaciones de muestra. Se muestran dirección, cantidad, plazo declarado, conservación y plan de ruta cuando existe para ese destino.

Las fotografías son referenciales y se sirven desde archivos locales; su procedencia está en [Fotografías del catálogo](Fotografias_catalogo.md). Los registros técnicos Prueba UI se ocultan mediante una columna específica, no se eliminan ni se renombran. Administración puede auditarlos o consultarlos con `GET /api/donaciones?incluir_ocultas=1`.

La preparación se ejecuta con `npm run demo:preparar`, después de migraciones y semilla inicial. Es idempotente respecto a la creación de ofertas/escenarios: no reinicia una cadena existente ni modifica sus hitos. No renueva artificialmente los plazos de lotes vencidos. Para otra fecha, publicar lotes nuevos con plazos vigentes. Al repetir pruebas UI, ejecutar `node scripts/archive-ui-records.mjs` para conservar sus registros fuera de la presentación.

## Contrato de API añadido

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /api/seguimiento | Entregas visibles según rol y propiedad |
| GET | /api/seguimiento/:id | Instantáneas, hitos, incidencias y plan temporal actual |
| POST | /api/seguimiento/:id/evaluacion | Ruta real y evaluación backend con escenario elegido |
| POST | /api/seguimiento/:id/hitos | Hito autenticado en orden y con versión vigente |
| GET | /api/incidencias | Incidencias visibles según rol |
| POST | /api/seguimiento/:id/incidencias | Reporte persistente y auditable |
| POST | /api/incidencias/:id/resolver | Resolución administrativa conservada |
| GET | /api/destinos | Organizaciones verificadas de destino para planificación |

Las mutaciones conservan controles de sesión, CSRF y origen. Un donante solo puede calcular desde sus donaciones; administración puede planificar globalmente. En el detalle, donante y administración pueden seleccionar destino sin inventar una solicitud aceptada.

## Demostración breve

1. Ingresar como Organización y abrir Buscar donaciones: mostrar fotografías, direcciones y oferta Juliaca–Puno.
2. Abrir Pan integral y su ruta precalculada hacia la organización. Cambiar escenario de tráfico y recalcular.
3. Abrir Seguimiento y custodia. Seleccionar el pan integral: mostrar A/B, distancia, tiempo base y estado de traslado.
4. Comparar salsa universitaria y crema hacia Juliaca. Explicar que el semáforo depende del plazo específico y del tiempo total.
5. Seleccionar yogur: mostrar incidencia crítica y alerta roja. La última temperatura aparece sin lectura si no se ha registrado una.
6. Mostrar la fruta recibida y sus seis hitos, con responsables, ubicaciones y hora.
7. Con un acuerdo nuevo, usar los formularios para registrar los pasos. No modificar los ejemplos si se necesita conservarlos para otra exposición.
8. Ingresar como Administrador, abrir Incidencias y consultar o registrar una resolución. La evidencia original se conserva.

Las cuentas públicas de prueba mantienen la contraseña `Realimenta2026!`; el acceso principal incluye botones Donante, Organización y Administrador. La segunda organización usa `organizacion2@realimenta.test` y destino Juliaca. No son cuentas de producción.

## Verificación

La suite de servidor se ejecuta con `npm test` en PostgreSQL temporal aislado. Incluye orden, permisos, transferencia con responsables, inmutabilidad, concurrencia, cancelación después de recojo, incidencias y confirmación bloqueada por prioridad alta. La evidencia final se registra en `evidencias/custodia-servidor.tap`.

`npm run test:ui` verifica ocho pruebas de navegador: cuatro recorridos previos y cuatro nuevos de catálogo, mapa/tráfico, cadena completa/incidencia/resolución y adaptación móvil. Las nuevas evidencias están en `evidencias/custodia-ui.json`, el reporte conjunto `evidencias/ui-playwright.json` y capturas locales. Las teselas del mapa se esperan antes de capturar. Los registros que crea la suite se conservan y se ocultan al terminar la preparación final.

Sigue pendiente la operación productiva: dispositivos GPS/sensores, firma digital, verificación documental de cuentas, notificaciones, alta disponibilidad, respaldo/restauración ensayados y validación de criterios alimentarios. La custodia manual y recepción registradas ya no se presentan como pendientes.
