# REQUERIMIENTOS NO FUNCIONALES DEL SISTEMA REAlimenta

Curso Taller de Desarrollo de Software  
Equipo del proyecto REAlimenta  
Versión 2.0  
Fecha 21 de octubre de 2026

## 1 Introducción

REAlimenta conecta establecimientos con excedentes declarados y organizaciones beneficiarias de Puno. Esta línea base distingue controles implementados, pruebas ejecutadas y objetivos pendientes de medición. Las funciones de donaciones y solicitudes utilizan API Express y PostgreSQL real. La evaluación de ruta es logística y temporal; las condiciones del alimento son declaradas por los actores.

## 2 Propósito

Establecer criterios verificables de calidad para el MVP y evidencias que permitan demostrar sus capacidades en el curso. Un requisito se marca probado solamente cuando existe una comprobación ejecutada dentro del alcance indicado.

## 3 Alcance

Incluye autenticación mínima, permisos, donaciones, solicitudes, geocodificación, mapas, rutas y evaluación temporal. El seguimiento físico, custodia, recepción, notificaciones, incidencias y verificación administrativa completa permanecen pendientes y se identifican así en la interfaz.

## 4 Estado actual del proyecto

El MVP conserva HTML, CSS y JavaScript Vanilla. Las publicaciones y decisiones se almacenan en PostgreSQL 17.10 aislado en este equipo. Las cuentas demostrativas están previamente verificadas mediante semillas; el registro público crea perfiles pendientes. Los datos de demostración usan puntos públicos de Puno y no atribuyen esas ubicaciones a establecimientos u organizaciones reales.

## 5 Arquitectura

Navegador HTML CSS JavaScript y Leaflet -> API Node.js Express -> PostgreSQL. La API valida permisos, transiciones, coordenadas, fechas y tiempos. La selección única combina bloqueo transaccional de donación e índice único parcial. Nominatim resuelve búsquedas explícitas y OSRM obtiene carretera y duración; OpenRouteService puede configurarse como alternativa con clave privada en backend. Las estimaciones no incluyen tráfico en vivo.

## 6 Requerimientos no funcionales

### RNF-01 Rendimiento del catálogo

Categoría: Rendimiento. Prioridad: Alta. Estado: Propuesto.

Descripción: El catálogo deberá responder con p95 de hasta 2 segundos.

Métrica medible: 20 sesiones concurrentes, 200 donaciones, 500 solicitudes; 1000 lecturas durante 5 minutos.

Criterio de aceptación: Al menos 95 % de respuestas en 2 s y menos de 1 % de errores 5xx.

Procedimiento de prueba: Ejecutar carga autenticada en un entorno documentado; excluir llamadas cartográficas.

Resultado obtenido: No se ejecutó la carga definida. Las pruebas funcionales no validan este umbral.

Evidencia disponible: tests/backend.test.mjs prueba catálogo funcional

### RNF-02 Rendimiento de escritura

Categoría: Rendimiento. Prioridad: Alta. Estado: Propuesto.

Descripción: Publicación y registro de solicitudes deberán responder con p95 de hasta 3 segundos.

Métrica medible: 10 operaciones por segundo durante 5 minutos, sin proveedor externo.

Criterio de aceptación: p95 <= 3 s, errores 5xx < 1 %, sin duplicados.

Procedimiento de prueba: Medir publicaciones y solicitudes válidas en base aislada; registrar hardware y volumen.

Resultado obtenido: Objetivo no medido mediante una prueba de carga representativa.

Evidencia disponible: Procedimiento definido en este documento

### RNF-03 Protección de contraseñas

Categoría: Seguridad. Prioridad: Alta. Estado: Probado.

Descripción: Las contraseñas se almacenan con scrypt y una sal aleatoria por usuario.

Métrica medible: 0 contraseñas en texto claro; scrypt N16384 r8 p1, salida de 64 bytes.

Criterio de aceptación: Login válido funciona; hash no coincide con texto y contraseña incorrecta se rechaza.

Procedimiento de prueba: Inspeccionar hash en base de pruebas y ejecutar login válido e inválido.

Resultado obtenido: Prueba automatizada aprobada; contraseña demo pública solo para entorno académico.

Evidencia disponible: tests/backend.test.mjs autenticación; server/auth.js

### RNF-04 Autorización por rol y propietario

Categoría: Seguridad. Prioridad: Alta. Estado: Probado.

Descripción: Cada operación protegida identifica sesión, rol y dueño del registro.

Métrica medible: 100 % de casos negativos definidos retornan 401 o 403.

Criterio de aceptación: Otro donante no lee ni modifica donaciones ajenas; organización no decide solicitudes.

Procedimiento de prueba: Ejecutar peticiones sin sesión, con rol incorrecto y con propietario ajeno; probar CSRF y Origin.

Resultado obtenido: Casos API y páginas protegidas aprobados.

Evidencia disponible: tests/backend.test.mjs seguridad y propiedad

### RNF-05 Integridad referencial

Categoría: Integridad de datos. Prioridad: Alta. Estado: Probado.

Descripción: PostgreSQL debe rechazar solicitudes y eventos con referencias inexistentes.

Métrica medible: Claves primarias y foráneas en todas las entidades de negocio.

Criterio de aceptación: Una solicitud huérfana produce error PostgreSQL 23503.

Procedimiento de prueba: Intentar insertar una solicitud con donación inexistente en base aislada.

Resultado obtenido: PostgreSQL rechazó el registro huérfano.

Evidencia disponible: tests/backend.test.mjs integridad; db/migrations/001_initial.sql

### RNF-06 Aceptación única concurrente

Categoría: Confiabilidad. Prioridad: Alta. Estado: Probado.

Descripción: Como máximo una solicitud puede ser aceptada por donación.

Métrica medible: 0 donaciones con dos aceptadas, incluso con dos decisiones concurrentes.

Criterio de aceptación: Una respuesta 200 y otra 409; las otras pendientes quedan rechazadas en la misma transacción.

Procedimiento de prueba: Lanzar dos aceptaciones en paralelo; consultar estado final y probar el índice parcial.

Resultado obtenido: Concurrencia aprobada; el índice único también rechaza duplicado con 23505.

Evidencia disponible: tests/backend.test.mjs aceptación transaccional

### RNF-07 Adaptación de interfaz

Categoría: Usabilidad. Prioridad: Alta. Estado: Probado.

Descripción: La interfaz debe ser utilizable en móvil y escritorio sin desbordamiento horizontal.

Métrica medible: Anchos de 360 y 1440 px; controles principales visibles y operables.

Criterio de aceptación: Login, navegación, catálogo y formularios conservan acceso a sus acciones.

Procedimiento de prueba: Ejecutar recorrido UI en Chrome y comprobar scrollWidth contra clientWidth.

Resultado obtenido: Prueba UI aprobada: landing, dashboard y catálogo a 360 px sin desbordamiento; recorrido de escritorio aprobado.

Evidencia disponible: tests/ui.spec.mjs; docs/evidencias/mobile.png

### RNF-08 Errores comprensibles

Categoría: Usabilidad. Prioridad: Alta. Estado: Probado.

Descripción: Los errores deben explicar el dato o estado que impide la operación.

Métrica medible: Errores JSON con code y message; 0 trazas SQL o secretos devueltos al cliente.

Criterio de aceptación: Cantidad inválida, fecha incoherente, permiso y conflicto tienen mensaje específico.

Procedimiento de prueba: Enviar entradas inválidas y revisar API y formulario.

Resultado obtenido: Validaciones API aprobadas; mensajes visibles integrados en formularios.

Evidencia disponible: tests/backend.test.mjs validaciones; server/errors.js

### RNF-09 Origen y destino visibles

Categoría: Integración cartográfica. Prioridad: Alta. Estado: Probado.

Descripción: El mapa debe distinguir establecimiento y organización y dibujar geometría del proveedor.

Métrica medible: 2 marcadores A y B; polilínea GeoJSON de carretera, zoom y desplazamiento.

Criterio de aceptación: No se sustituye la ruta de carretera por una línea recta o imagen estática.

Procedimiento de prueba: Abrir detalle y Ver ruta de entrega, inspeccionar marcadores y polilínea.

Resultado obtenido: Ruta de carretera dibujada con 23 puntos, marcadores A/B y 6/6 teselas cargadas en Chrome.

Evidencia disponible: js/maps.js; tests/ui.spec.mjs; docs/evidencias/ruta-real.png

### RNF-10 Rutas de fuente real

Categoría: Interoperabilidad. Prioridad: Alta. Estado: Probado.

Descripción: La distancia y duración deben proceder de OSRM u OpenRouteService configurado.

Métrica medible: distancia_km = metros/1000; duración = segundos/60; proveedor y fecha original visibles.

Criterio de aceptación: Una consulta real devuelve geometría, distancia y duración válidas.

Procedimiento de prueba: Ejecutar node scripts/verify-map-providers.mjs con puntos públicos en Puno.

Resultado obtenido: Nominatim confirmó Catedral y Parque Pino; OSRM devolvió 1.258 km, 3 min y 23 puntos de geometría.

Evidencia disponible: docs/evidencias/proveedores-reales.json

### RNF-11 Fallo de proveedor explícito

Categoría: Confiabilidad. Prioridad: Alta. Estado: Probado.

Descripción: Un fallo externo o ausencia de ruta no genera tiempos ni distancias inventados.

Métrica medible: Timeout de 15 s; errores 502 o SIN_RUTA; acción de reintento disponible.

Criterio de aceptación: 503 externo, NoRoute y respuesta inválida no producen una ruta utilizable.

Procedimiento de prueba: Ejecutar proveedor HTTP controlado solo dentro de la prueba automatizada.

Resultado obtenido: Casos de fallo y respuesta inválida aprobados; producción conserva proveedor real.

Evidencia disponible: tests/providers.test.mjs

### RNF-12 Protección de configuración

Categoría: Seguridad. Prioridad: Alta. Estado: Probado.

Descripción: Credenciales PostgreSQL y claves privadas solo residen en backend y .env ignorado.

Métrica medible: 0 claves privadas en archivos servidos; .env y server no accesibles por HTTP.

Criterio de aceptación: Peticiones a .env, SQL y fuentes privadas retornan 404.

Procedimiento de prueba: Probar rutas privadas y revisar lista blanca de archivos estáticos.

Resultado obtenido: Pruebas de archivos privados aprobadas; frontend usa API propia.

Evidencia disponible: tests/backend.test.mjs; .gitignore; server/app.js

### RNF-13 Auditoría de decisiones

Categoría: Trazabilidad. Prioridad: Alta. Estado: Probado.

Descripción: Publicación, edición, cancelación, aceptación, rechazo y sesión registran actor y fecha.

Métrica medible: Cada acción sensible produce un evento en auditoria dentro de su transacción.

Criterio de aceptación: Se puede reconstruir quién decidió y el estado relacionado sin exponer contraseñas.

Procedimiento de prueba: Consultar eventos tras acciones y verificar permisos del historial.

Resultado obtenido: Auditoría y control de lectura aprobados.

Evidencia disponible: tests/backend.test.mjs auditoría; tabla auditoria

### RNF-14 Persistencia entre reinicios

Categoría: Confiabilidad. Prioridad: Alta. Estado: Probado.

Descripción: Donaciones, solicitudes y sesiones deben sobrevivir el cierre del navegador y reinicio del backend.

Métrica medible: 0 pérdida de registros al detener y volver a iniciar un proceso Node.

Criterio de aceptación: La misma donación y sesión se recuperan después del reinicio.

Procedimiento de prueba: Crear registro, detener proceso propio, reiniciarlo y consultar por ID con la misma sesión.

Resultado obtenido: Prueba con dos procesos Node sucesivos aprobada; almacenamiento PostgreSQL real.

Evidencia disponible: tests/backend.test.mjs persistencia de proceso

### RNF-15 Acceso a datos personales

Categoría: Privacidad. Prioridad: Alta. Estado: Implementado.

Descripción: Los datos de contacto y direcciones se limitan a los actores autorizados.

Métrica medible: Sesiones HttpOnly, autorización de solicitudes por propietario y archivos privados denegados.

Criterio de aceptación: Una organización no consulta solicitudes de otra; solo participantes o administración ven su información.

Procedimiento de prueba: Ejecutar matriz de acceso; revisar respuestas JSON e inventario de datos.

Resultado obtenido: Controles técnicos básicos implementados y probados. Retención, ejercicio de derechos y revisión legal de producción pendientes.

Evidencia disponible: server/auth.js; server/business.js; tests/backend.test.mjs

### RNF-16 Información insuficiente

Categoría: Integración cartográfica. Prioridad: Alta. Estado: Probado.

Descripción: La evaluación debe ser gris cuando falte ruta, límite declarado o información necesaria.

Métrica medible: Estado gris con explicación; tiempo_total no inventado.

Criterio de aceptación: Sin límite o sin ruta no aparece un semáforo verde.

Procedimiento de prueba: Ejecutar unidades sin fecha/ruta y cadena de frío sin declaración.

Resultado obtenido: Pruebas de estado gris aprobadas.

Evidencia disponible: tests/logistics.test.js

### RNF-17 Disponibilidad del servicio

Categoría: Disponibilidad. Prioridad: Media. Estado: Propuesto.

Descripción: Para un futuro piloto se propone disponibilidad mensual de al menos 99.5 %.

Métrica medible: Monitoreo cada minuto; mantenimiento anunciado de hasta 2 h/mes excluido.

Criterio de aceptación: Disponibilidad medida durante un mes alcanza el objetivo.

Procedimiento de prueba: Instalar monitoreo externo y registrar incidentes en despliegue de piloto.

Resultado obtenido: Solo se verificó arranque local y endpoint health; no existe medición mensual ni SLA productivo.

Evidencia disponible: GET /api/health; objetivo pendiente de despliegue

### RNF-18 Recuperación de datos

Categoría: Confiabilidad. Prioridad: Alta. Estado: Propuesto.

Descripción: Antes de producción deben existir respaldos y un procedimiento de restauración probado.

Métrica medible: RTO propuesto <= 4 h; RPO propuesto <= 24 h; respaldo diario cifrado.

Criterio de aceptación: Restauración en base aislada recupera registros dentro de los límites.

Procedimiento de prueba: Ejecutar pg_dump, conservar copia cifrada y ensayar restauración trimestral.

Resultado obtenido: PostgreSQL persistente configurado; no se ensayó un plan de respaldo/restauración.

Evidencia disponible: docs/Configuracion_PostgreSQL.md; procedimiento pendiente

### RNF-19 Mantenibilidad del MVP

Categoría: Mantenibilidad. Prioridad: Media. Estado: Probado.

Descripción: Presentación, autenticación, reglas y logística deben estar separadas y tener regresiones ejecutables.

Métrica medible: Módulos independientes; npm test con 0 fallos; migraciones versionadas.

Criterio de aceptación: Un cambio de reglas puede probarse sin navegador y sin alterar datos del MVP.

Procedimiento de prueba: Ejecutar suite en una base temporal creada para pruebas.

Resultado obtenido: Suite automatizada aprobada y base de pruebas aislada eliminada al finalizar.

Evidencia disponible: server/**; tests/**; scripts/migrate.mjs

### RNF-20 Compatibilidad de navegador

Categoría: Compatibilidad. Prioridad: Media. Estado: Implementado.

Descripción: La interfaz debe operar en navegadores modernos de escritorio y móviles.

Métrica medible: Chrome y Edge actuales como base del MVP; Firefox/Safari como objetivo adicional.

Criterio de aceptación: Flujo esencial sin errores JavaScript en Chrome; portada verificable en Edge.

Procedimiento de prueba: Ejecutar pruebas de navegador; repetir manualmente en otras familias antes de producción.

Resultado obtenido: Cuatro pruebas UI Chrome aprobadas, sin errores JavaScript ni de consola. Portada abierta en Edge; Firefox y Safari pendientes.

Evidencia disponible: tests/ui.spec.mjs; capturas docs/evidencias

### RNF-21 Escalabilidad objetivo

Categoría: Escalabilidad. Prioridad: Media. Estado: Propuesto.

Descripción: La API deberá conservar el rendimiento con crecimiento de registros y concurrencia.

Métrica medible: Objetivo 100 usuarios concurrentes y 100000 donaciones con índices y paginación.

Criterio de aceptación: Mantener RNF01 y RNF02 en el volumen definido.

Procedimiento de prueba: Cargar datos sintéticos en entorno aislado y medir latencias y plan de consultas.

Resultado obtenido: Índices implementados; volumen y concurrencia objetivo no probados.

Evidencia disponible: db/migrations/001_initial.sql

### RNF-22 Contrato de intercambio

Categoría: Interoperabilidad. Prioridad: Alta. Estado: Probado.

Descripción: La API usa REST, JSON UTF-8 e instantes ISO8601 con zona horaria.

Métrica medible: 400/401/403/404/409/422/429/502 coherentes; fechas timestamptz en PostgreSQL.

Criterio de aceptación: Frontend interpreta fechas America/Lima y errores sin depender de datos locales ficticios.

Procedimiento de prueba: Ejecutar contratos de donación/solicitud y revisar campos persistidos.

Resultado obtenido: Contratos y cronología aprobados en integración; endpoints documentados.

Evidencia disponible: docs/API_REAlimenta.md; tests/backend.test.mjs

### RNF-23 Uso responsable cartográfico

Categoría: Integración cartográfica. Prioridad: Alta. Estado: Implementado.

Descripción: Los servicios públicos deben tener caché, atribución, identificación y límite agregado.

Métrica medible: Nominatim y OSRM como máximo 1 consulta por 1.1 s por proveedor; caché 24 h/60 min; geocodificación manual, no autocompletado.

Criterio de aceptación: Se muestra atribución OSM; no se suprime Referer; las búsquedas requieren acción explícita.

Procedimiento de prueba: Inspeccionar mapa, cabeceras, cola y caché; verificar fecha original del proveedor.

Resultado obtenido: Implementación con cola, caché y Referrer-Policy strict-origin-when-cross-origin; servicio público solo para uso académico de bajo volumen.

Evidencia disponible: server/logistics.js; server/app.js; js/maps.js

### RNF-24 Accesibilidad de controles

Categoría: Accesibilidad. Prioridad: Alta. Estado: Implementado.

Descripción: Los controles esenciales deben tener etiquetas, foco visible y operación por teclado.

Métrica medible: Inputs etiquetados y diálogo nativo; colores acompañados por nombre y mensaje.

Criterio de aceptación: Es posible iniciar sesión, navegar y cerrar un modal por teclado.

Procedimiento de prueba: Probar Tab, Enter y Escape; revisar contraste y lectores de pantalla antes de declarar WCAG2.2AA.

Resultado obtenido: Navegación y diálogo nativo probados por teclado en Chrome. Auditoría completa WCAG y lector de pantalla pendientes.

Evidencia disponible: HTML; css/mvp.css; tests/ui.spec.mjs

## 7 Métodos de verificación

La suite Node usa una base PostgreSQL temporal y comprueba la API mediante peticiones HTTP, incluyendo acceso cruzado, CSRF, integridad y dos aceptaciones simultáneas. Las pruebas unitarias controlan el reloj para comprobar los límites del semáforo. Solo las pruebas de error cartográfico utilizan un proveedor HTTP controlado; la aplicación normal consulta servicios externos reales. La suite UI opera Chrome y comprueba el recorrido entre dos roles.

## 8 Criterios de aceptación

La demostración académica requiere arranque sin errores, conexión PostgreSQL, publicación persistente, solicitud persistente, aceptación única, permisos negativos y una ruta real consultable. Las metas de carga, disponibilidad mensual, recuperación y certificación completa de accesibilidad requieren pruebas adicionales antes de producción.

## 9 Matriz de trazabilidad

| Requisitos | Componente | Evidencia principal |
| --- | --- | --- |
| RNF01 RNF02 RNF21 | API y PostgreSQL | Metas propuestas de carga |
| RNF03 RNF04 RNF12 RNF15 | Autenticación y autorización | tests/backend.test.mjs |
| RNF05 RNF06 RNF13 RNF14 | Donaciones y solicitudes | tests/backend.test.mjs |
| RNF07 RNF08 RNF20 RNF24 | Frontend | tests/ui.spec.mjs |
| RNF09 RNF10 RNF11 RNF16 RNF23 | Mapas y logística | logistics.test.js providers.test.mjs proveedores-reales.json |
| RNF17 RNF18 | Operación futura | Objetivos pendientes de despliegue |
| RNF19 RNF22 | Arquitectura y contrato | tests y documentación API |

## 10 Resultados de pruebas

La suite de API, PostgreSQL, logística y errores de proveedores aprobó 23 de 23 pruebas, sin fallos ni omitidas. El reporte generado por el ejecutor está en docs/evidencias/pruebas-unitarias-integracion.tap. La suite de navegador aprobó 4 de 4 pruebas: publicar y aceptar entre roles con ruta real, editar y cancelar, adaptación móvil y protección frente a contenido almacenado ejecutable. Registró cero errores JavaScript y cero errores de consola. La evidencia está en ui-resumen.json y ui-playwright.json. Se verificó también la parada y arranque de PostgreSQL sin pérdida de la base y sin sobrescribir credenciales. Una prueba local no constituye un SLA productivo.

## 11 Limitaciones

La infraestructura actual es local. El usuario PostgreSQL de arranque es administrador para facilitar migraciones y bases aisladas de prueba, y debe reemplazarse por permisos mínimos en producción. HTTPS, respaldos operativos, monitoreo mensual y proveedor cartográfico con garantía requieren despliegue y configuración. Las rutas públicas tienen disponibilidad sin garantía. No hay tráfico en vivo, sensores, validación sanitaria ni firma digital. La aprobación administrativa de perfiles públicos permanece pendiente.

## 12 Conclusiones

Los controles del MVP permiten comprobar transacciones persistentes y decisiones excluyentes entre donante y organización. La calidad documentada se limita a la evidencia ejecutada; los objetivos de capacidad y operación deben verificarse en el entorno de piloto antes de ampliar el uso.

## 13 Referencias técnicas

- Documentación Express https://expressjs.com/en/advanced/best-practice-security.html
- PostgreSQL https://www.postgresql.org/docs/current/ddl-constraints.html
- OSRM API https://project-osrm.org/docs/v5.24.0/api/
- Política OSRM https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
- Política Nominatim https://operations.osmfoundation.org/policies/nominatim/
- Política de teselas OSM https://operations.osmfoundation.org/policies/tiles/

