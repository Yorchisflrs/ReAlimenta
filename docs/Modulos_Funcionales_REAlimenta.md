# MÓDULOS FUNCIONALES DEL SISTEMA REAlimenta

**Curso:** Taller de Desarrollo de Software. **Proyecto:** REAlimenta 2.0. **Ámbito inicial:** Puno, Perú. **Versión:** 2.0. **Fecha:** 21 de octubre de 2026.

## 1. Propósito y estado de la evidencia

Se documentan los dos módulos prioritarios: gestión de donaciones y de solicitudes. Se conserva HTML/CSS/JavaScript del proyecto original y se añade Express con PostgreSQL real. Los registros de negocio y sesiones persisten en base de datos, sin utilizar localStorage/arreglos como sustitutos.

Resultado registrado: **32 pruebas API/lógica aprobadas de 32, cero fallos y cero omitidas** ([reporte TAP](evidencias/custodia-servidor.tap)), incluidas las de seguimiento y custodia. La primera ejecución de 23 pruebas se conserva como antecedente. La suite crea/migra/siembra una base temporal aislada y la elimina al concluir. Además, **4/4 pruebas de navegador aprobadas** verifican los recorridos principales en Chrome/Playwright, incluida ruta real; su alcance se detalla a continuación y no equivale a certificación total de accesibilidad o de todos los controles visuales.

Evidencias: [reporte TAP](evidencias/pruebas-unitarias-integracion.tap), [backend](../tests/backend.test.mjs), [logística](../tests/logistics.test.js), [proveedor](../tests/providers.test.mjs), [consulta real Nominatim/OSRM](evidencias/proveedores-reales.json), [resumen UI](evidencias/ui-resumen.json) y [pruebas UI](../tests/ui.spec.mjs). Los fallos simulados no sustituyen la consulta real de demostración. La ejecución UI `mvhz8xmz` publicó la donación #9, creó/aceptó la solicitud #3, editó/canceló la donación #10 y canceló la solicitud #4. La donación #11 comprobó escape de contenido almacenado y se canceló después de probarla.

## 2. Arquitectura y servicios comunes

```text
HTML/CSS/JavaScript + Leaflet
             |
       API REST Express
       /             \
PostgreSQL real     Proveedores geográficos
usuarios, perfiles, Nominatim y OSRM / ORS
sesiones, donaciones,
solicitudes, rutas,
auditoría
```

Contraseñas scrypt con sal aleatoria, sesiones PostgreSQL, cookie HttpOnly/SameSite, token CSRF y comprobación de origen. El servidor valida rol y propiedad; no depende de ocultar botones. Fechas `timestamptz`, reloj real del servidor y presentación America/Lima.

El registro público crea perfiles pendientes. Las cuentas de semilla están claramente identificadas como pruebas previamente verificadas; todavía no existe aprobación administrativa documental. Ver el [contrato API](API_REAlimenta.md).

## 3. Módulo 1: gestión de donaciones

### 3.1 Objetivo y alcance

Permitir al donante habilitado publicar excedentes con condiciones declaradas, consultar detalle/solicitudes, editar mientras el estado lo permita y cancelar con motivo. Las organizaciones consultan catálogo elegible y el administrador registros autorizados. El alcance termina en administrar la publicación y asignarla mediante solicitud aceptada; entrega física, custodia y recepción son posteriores.

### 3.2 Actores

| Actor | Participación |
| --- | --- |
| Donante verificado | Crea, consulta, edita y cancela sus publicaciones; revisa solicitudes. |
| Organización beneficiaria | Consulta catálogo, condiciones y ubicación. |
| Administrador | Consulta registros/auditoría sin suplantar al propietario. |
| Sistema | Valida, persiste, vence publicaciones y audita. |

### 3.3 Requisitos funcionales

| Código | Requisito |
| --- | --- |
| RF-D01 | Registrar alimento, categoría, cantidad positiva, unidad, descripción y envase. |
| RF-D02 | Registrar conservación, necesidad de frío y temperatura declarada opcional. |
| RF-D03 | Registrar disponibilidad, límite de recojo y aprovechamiento declarado opcional con cronología coherente. |
| RF-D04 | Registrar dirección, distrito y coordenadas de recojo válidas. |
| RF-D05 | Consultar publicaciones propias, estado y detalle persistente. |
| RF-D06 | Editar disponibles sin solicitudes activas. |
| RF-D07 | Cancelar disponibles/en proceso con motivo e historial. |
| RF-D08 | Mostrar a organizaciones publicaciones elegibles no vencidas. |
| RF-D09 | Consultar solicitudes asociadas según autorización. |
| RF-D10 | Vencer publicaciones y rechazar pendientes automáticamente con auditoría. |

### 3.4 Reglas de negocio

1. Solo el donante propietario verificado crea/edita; el identificador proviene de sesión.
2. Estado inicial `disponible`, impuesto por backend. POST/PATCH no aceptan estado arbitrario.
3. Cantidad positiva; textos y coordenadas dentro de los límites del backend.
4. Límite de recojo posterior a disponibilidad y al momento del servidor al guardar. Aprovechamiento declarado opcional, igual o posterior a recojo.
5. Recojo y aprovechamiento son fechas distintas. El límite declarado no certifica inocuidad.
6. Se edita únicamente disponible sin solicitudes pendientes/aceptadas. Cambios con solicitudes activas requieren cancelar la publicación con motivo.
7. Cancelar disponible/en proceso cancela sus solicitudes pendientes/aceptadas en la misma transacción, con motivos y auditoría.
8. Catálogo excluye vencidas, canceladas, en proceso y donantes no verificados/activos.
9. Vencimiento con reloj real antes de operaciones y cada minuto; una consulta actualiza vencimientos sin esperar el intervalo.
10. No hay borrado físico por API; se conserva historial.

### 3.5 Pantallas

`login.html`: identificación. `donante.html`: vista general, mis donaciones, formulario y detalle. `organizacion.html`: catálogo, filtros y detalle. `administrador.html`: consulta y auditoría. Los paneles autorizan por rol en servidor. Las pruebas UI verifican publicación, recarga y consulta, edición/cancelación y vistas a 360 px. El panel administrativo no tiene una prueba visual integral específica; su autorización y acceso a datos están comprobados por API.

### 3.6 Endpoints y tablas

| Operación | Endpoint |
| --- | --- |
| Listado/filtros | `GET /api/donaciones` |
| Publicación | `POST /api/donaciones` |
| Detalle/solicitudes autorizadas | `GET /api/donaciones/:id` |
| Edición parcial | `PATCH /api/donaciones/:id` |
| Cancelación | `POST /api/donaciones/:id/cancelar` |

Tablas: `donacion`, `donante`, `usuario`, `solicitud`, `auditoria`, `sesion` y `evaluacion_ruta`. La [migración](../db/migrations/001_initial.sql) define PK/FK, comprobaciones de cantidad/fechas/coordenadas e índices de catálogo/propietario.

### 3.7 Validaciones

Obligatorios: alimento, categoría, cantidad, unidad, disponibilidad, límite de recojo, dirección, distrito, coordenadas, conservación, booleano de frío y envase. Opcionales: descripción, observaciones, temperatura y aprovechamiento. Fechas con zona explícita; cantidad positiva; latitud [-90,90], longitud [-180,180]. El backend verifica propiedad, sesión, rol, estado y CSRF. Los errores devuelven HTTP y mensaje JSON comprensible.

### 3.8 Casos de uso

| Caso | Precondición y flujo | Resultado/alternativas |
| --- | --- | --- |
| CU-D01 Publicar | Donante verificado completa datos y confirma punto; servidor valida/inserta/audita. | `201` persistido; inválidos `422`, perfil pendiente `403`. |
| CU-D02 Consultar/editar | Propietario consulta disponible sin solicitudes activas y modifica. | `200`; ajeno `403`, estado incompatible `409`. |
| CU-D03 Cancelar | Propietario disponible/en proceso ingresa motivo; servidor bloquea y cancela registros vinculados. | Estados y auditoría atómicos; cerrada `409`. |
| CU-D04 Catálogo | Organización filtra y abre detalle; servidor actualiza vencimientos. | Solo elegibles; vencidas no admiten solicitudes. |

### 3.9 Pruebas y resultados

| Verificación exigida | Evidencia automatizada | Resultado |
| --- | --- | --- |
| Donante autenticado | Seguridad/auth backend | Sin sesión `401`; organización/admin al crear `403`. |
| Creación válida | Donaciones: creación… | `201`, fila SQL con cantidad 30 y estado disponible. |
| Persistencia PG | Creación/reinicio de procesos | Fila consultable tras detener y reiniciar procesos Node. |
| Consulta | Listado/detalle/filtros | Publicación presente según actor autorizado. |
| Edición | PATCH parcial | `200`, cantidad/alimento actualizados. |
| Cancelación | POST con motivo | Cancelada, motivo conservado y fuera de catálogo. |
| Validaciones incorrectas | Cantidad, fechas, obligatorios, coordenadas | `422` con mensaje; ID inválido `400`. |
| Permisos | Segundo donante de prueba | Lectura/edición/cancelación/decisión ajena `403`. |
| Expiración | Ventana vencida en base de prueba | Vencida, pendientes rechazadas, auditoría y nuevo POST `409`. |
| Vista de organizaciones | API catálogo/detalle y E2E UI | Publicación #9 encontrada, abierta y solicitada desde organización. |

Funciones terminadas a nivel API/PG: creación, consulta/filtros, edición permitida, cancelación, estado, solicitudes vinculadas, vencimiento y auditoría. En navegador se verificaron creación/recarga/consulta, edición y cancelación mediante formularios reales. Pendientes de ampliar: grandes volúmenes, accesibilidad completa, cobertura de todos los filtros y navegadores y pruebas de carga.

## 4. Módulo 2: gestión de solicitudes

### 4.1 Objetivo y alcance

Permitir a la organización solicitar recojo, declarar responsable/medios, seguir estado y cancelar pendientes. El donante consulta propuestas/rutas y acepta o rechaza. Una aceptación asigna la donación completa a una organización: no se fracciona cantidad. La recepción física sigue fuera del alcance funcional actual.

### 4.2 Actores

| Actor | Participación |
| --- | --- |
| Organización verificada | Consulta, evalúa ruta, solicita y cancela pendientes propias. |
| Donante propietario | Consulta solicitudes/rutas y acepta/rechaza. |
| Administrador | Consulta registros y logística autorizados. |
| Sistema/PostgreSQL | Transacciones, bloqueos, unicidad y auditoría. |

### 4.3 Requisitos funcionales

| Código | Requisito |
| --- | --- |
| RF-S01 | Consultar/filtrar donaciones con conservación y ubicación. |
| RF-S02 | Consultar ruta real, distancia/duración y evaluación temporal backend. |
| RF-S03 | Registrar responsable, teléfono, transporte, recipiente, fecha, frío y observaciones. |
| RF-S04 | Persistir y consultar propias/recibidas según rol. |
| RF-S05 | Evitar duplicados activos por organización/donación. |
| RF-S06 | Cancelar pendientes propias con motivo. |
| RF-S07 | Rechazar pendientes por donante propietario con motivo. |
| RF-S08 | Aceptar una, rechazar las demás pendientes y cambiar donación a en proceso atómicamente. |
| RF-S09 | Evitar aceptaciones dobles ante concurrencia. |
| RF-S10 | Conservar decisiones e historial auditable. |

### 4.4 Reglas de negocio

1. Organización verificada; identificador de sesión, no confiado al cliente.
2. Publicación disponible, no vencida y donante verificado/activo. Fecha propuesta futura dentro de disponibilidad/recojo.
3. Varias organizaciones pueden solicitar; índice parcial impide dos activas de la misma organización para una publicación.
4. Tras rechazo/cancelación puede reenviar si continúa disponible.
5. Donante propietario decide sobre pendientes. Organización solo cancela pendientes propias; no aceptadas.
6. Decisiones bloquean primero la fila de donación. Aceptar actualiza elegida, otras pendientes, publicación y auditoría dentro de una transacción.
7. Índice `solicitud_unica_aceptada` impone el máximo también en PostgreSQL. Dos POST simultáneos probados producen 200/409 y una aceptada.
8. Enviar solicitud no reserva automáticamente.
9. Semáforo evalúa logística/tiempo; no certifica consumo. Faltantes producen gris y errores externos no inventan duración.
10. Cuentas y ubicaciones demo no representan ofertas de establecimientos reales.

### 4.5 Pantallas, endpoints y tablas

`organizacion.html`: catálogo, detalle/mapa y mis solicitudes. `donante.html`: recibidas, decisiones y rutas por solicitante. `administrador.html`: consulta y auditoría. Chrome/Playwright verificó envío, aceptación y consulta posterior de aceptada, además de cancelación pendiente. El rechazo tiene cobertura API, sin prueba específica de navegador en esta ejecución.

| Operación | Endpoint |
| --- | --- |
| Catálogo/detalle | `GET /api/donaciones`, `GET /api/donaciones/:id` |
| Consultar solicitudes | `GET /api/solicitudes` |
| Enviar | `POST /api/donaciones/:id/solicitudes` |
| Aceptar | `POST /api/solicitudes/:id/aceptar` |
| Rechazar | `POST /api/solicitudes/:id/rechazar` |
| Cancelar | `POST /api/solicitudes/:id/cancelar` |
| Evaluar carretera | `POST /api/donaciones/:id/evaluacion` |
| Historial | `GET /api/auditoria` |

Tablas: `solicitud`, `donacion`, `organizacion`, `donante`, `usuario`, `evaluacion_ruta`, `auditoria`, `sesion`. Los listados incluyen objetos de donación/organización/donante sin ampliar los permisos del actor.

### 4.6 Validaciones

Responsable 2–160 caracteres, teléfono 6–40, transporte/recipiente 2–300, observaciones opcionales hasta 2500, fecha propuesta futura con zona explícita dentro de ventana. Rechazar/cancelar exigen motivo 5–1000; aceptar admite motivo opcional. Se valida propiedad, estado y rol en servidor y transacción.

### 4.7 Casos de uso

| Caso | Precondición y flujo | Resultado/alternativas |
| --- | --- | --- |
| CU-S01 Solicitar | Organización verificada consulta condiciones/ruta, completa logística y envía. | `201`; duplicado/vencida `409`, fecha inválida `422`. |
| CU-S02 Decidir | Donante consulta organización/ruta y acepta/rechaza pendiente propia. | Cambios transaccionales/auditoría; carrera perdida `409`. |
| CU-S03 Cancelar | Organización propietaria ingresa motivo sobre pendiente. | Cancelada auditada; ajena `403`, cerrada `409`. |
| CU-S04 Evaluar | Actor autorizado y puntos confirmados; proveedor calcula y backend evalúa. | Ruta real/semáforo; gris sin datos y error recuperable ante proveedor. |

### 4.8 Pruebas y resultados

| Verificación exigida | Evidencia | Resultado |
| --- | --- | --- |
| Organización autenticada | Auth/seguridad/registro | Rol/perfil correctos; cuenta pendiente bloqueada. |
| Catálogo | Donaciones/filtros | Publicación disponible consultable. |
| Registro válido | Solicitudes: creación… | `201` con logística y fecha. |
| Persistencia | SELECT SQL/listados | Solicitud recuperada de PG con objetos relacionados. |
| Duplicado | Organización/donación activa repetida | `409` y restricción SQL. |
| Vencida | Prueba vencimiento | POST `409`; pendiente previa rechazada y auditada. |
| Rechazo | POST con motivo | `200`, estado persistido rechazada. |
| Aceptación | Decisiones paralelas | Una aceptada, donación en proceso. |
| Aceptación única | SELECT y UPDATE SQL inválido | Una aceptada; segundo intento directo falla `23505`. |
| Dos aceptaciones simultáneas | `Promise.all` de POST reales | 200/409, otra pendiente rechazada. |
| Auditoría | SQL/endpoint autorizado | Crear, aceptar y rechazo no seleccionado presentes. |
| Permisos | Otros donante/organización | Acciones ajenas `403`. |

### 4.9 Funciones terminadas y limitaciones

Solicitud, consulta, rechazo, aceptación única, cancelación pendiente y auditoría implementadas/probadas en API/PG, incluida carrera real entre dos POST. En navegador se verificaron envío, consulta y aceptación persistida (#3), cancelación de solicitud (#4), edición/cancelación de publicación (#10) y modal con Tab/Escape y retorno de foco. La ejecución específica no prueba el botón de rechazo; su comportamiento está probado en API.

No incluye fraccionamiento, cancelación por organización tras aceptar, negociación, avisos automáticos, entrega/recepción ni cierre físico. Una evaluación roja informa y no bloquea automáticamente toda solicitud; los responsables revisan condiciones y futuros criterios especializados. No se han medido p95 bajo carga ni disponibilidad productiva.

## 5. Mapas y evaluación logística

Geocodificación manual Nominatim por backend, confirmación/ajuste de punto y cartografía OpenStreetMap/Leaflet con atribución. OSRM público permite rutas reales sin clave para bajo volumen académico. ORS está integrado como alternativa privada, pero no se probó con una credencial propia.

La evidencia real del 21 de octubre de 2026 registra Catedral de Puno/Parque Pino y ruta de **1,258 km, 3 minutos, 23 puntos**. Resultado puntual, no constante del código. Sin tráfico en vivo. Una dirección ambigua requiere confirmación del usuario.

| Verificación | Resultado/evidencia |
| --- | --- |
| Geocodificación/confirmación | JSON real y prueba registro con ubicación confirmada persistida. |
| Carretera/distancia/duración | GeoJSON real en `proveedores-reales.json`. |
| Error, NoRoute y geometría inválida | `providers.test.mjs`, sin datos ficticios. |
| Verde/amarillo/rojo/gris | Siete pruebas logísticas con márgenes, frío y ventana futura. |
| Dibujo del mapa y ruta | UI aprobada: LineString de 23 puntos, origen/destino, 6/6 teselas cargadas y panel verde visible. No se ensayaron todas las combinaciones de zoom/desplazamiento. |

Fórmula backend: espera programada + preparación + recojo + transporte real + entrega + margen de seguridad. Margen restante = tiempo hasta aprovechamiento declarado menos total. Verde suficiente según umbral, amarillo positivo reducido, rojo tiempo/condiciones incompatibles y gris información insuficiente. Son parámetros demostrativos de planificación, no límites sanitarios.

## 6. Matriz para exposición

| Funcionalidad | Estado API/PG | Evidencia | Cierre interfaz |
| --- | --- | --- | --- |
| Sesión/rol/cierre | Probado | Auth/cookie/CSRF | Login en Chrome UI; login/logout manual Edge devuelve a login |
| Publicar/consultar | Probado | POST y SELECT SQL | Donación #9 creada, recargada y visible |
| Editar/cancelar | Probado | PATCH/propiedad/estado | Donación #10 editada a 17 unidades y cancelada |
| Persistencia tras reinicio | Probado | Dos procesos Node reales | UI comprobó recarga; reinicio de proceso cubierto por API |
| Filtrar/abrir catálogo | Probado API | Respuestas filtradas | Búsqueda por texto y apertura de #9 comprobadas; otros filtros no exhaustivos |
| Enviar/consultar solicitud | Probado | POST/SELECT/contexto | Solicitud #3 enviada y aceptada visible tras recarga |
| Rechazar/cancelar | Probado | Motivo/estado | Cancelación #4 comprobada; rechazo solo API |
| Aceptar/rechazar otras | Probado | Transacción/auditoría | Aceptación #3 comprobada; autorechazos concurrentes cubiertos por API |
| Concurrencia única | Probado | 200/409 e índice | Evidencia técnica API, sin dos clics paralelos en UI |
| Carretera real | Consulta real registrada | JSON proveedor y resumen UI | OSRM 1,258 km / 3 min, 23 puntos, 6/6 teselas |
| Semáforo/faltantes | Probado lógica | Suite logística | Verde visible en UI; amarillo/rojo/gris cubiertos por lógica |
| Proveedor fallido | Probado controlado | Suite proveedor | Mensaje/reintento no tiene prueba UI específica |
| RNF | Documento complementario | Documento RNF | No medidos siguen propuestos |

## 7. Reproducción de pruebas

```powershell
npm install
npm run db:start
npm run db:migrate
npm run db:seed
npm test
```

El usuario de pruebas necesita permiso para crear su base temporal `realimenta_test_<pid>_<aleatorio>`; solo esa base creada por la suite se elimina. Se preserva la base de aplicación. Regenerar evidencia:

```powershell
node --test --test-reporter=tap --test-reporter-destination=docs/evidencias/pruebas-unitarias-integracion.tap "tests/*.test.*"
```

La ejecución registrada aprueba 32 pruebas API/lógica y los recorridos de navegador, sin acreditar carga/disponibilidad ni ausencia absoluta de vulnerabilidades. La prueba UI almacena marcado en alimento/categoría de #11 y confirma que aparece como texto, con cero elementos ejecutables y sin activación del payload. La evidencia UI registra cero errores JavaScript, cero errores de consola y cero respuestas API fallidas durante los cuatro recorridos aprobados. Landing, dashboard y listado no desbordan horizontalmente a 360 px. El modal nativo se recorrió con Tab/Escape, sin activar el contenido de fondo y devolviendo foco al cierre; esto no demuestra cumplimiento total de WCAG.

## 8. Pendientes y conclusión de alcance

Pendientes explícitos (seguimiento, custodia e incidencias ya se implementaron, ver [Seguimiento_y_Custodia_REAlimenta.md](Seguimiento_y_Custodia_REAlimenta.md)): firmas/recepción, verificación documental, notificaciones, reportes/impacto, sensores y validación sanitaria. Los criterios definitivos de conservación requieren profesionales de Nutrición e Ingeniería Agroindustrial.

Ambos módulos tienen backend y persistencia reales con reglas y pruebas reproducibles, y los recorridos principales están verificados en navegador con proveedor de rutas real. La [guía de 20 pasos](DEMOSTRACION_REAlimenta.md) permite repetir la exposición con nuevas fechas vigentes. Las extensiones de cobertura indicadas y los requisitos no funcionales no medidos se mantienen pendientes/propuestos, no cumplidos.
