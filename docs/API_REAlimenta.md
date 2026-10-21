# API REST de REAlimenta 2.0

Versión 2.0. Fecha: 21 de octubre de 2026. Base local: `http://127.0.0.1:3000/api`. Express, PostgreSQL real y JSON UTF-8.

## Convenciones

Respuesta de negocio correcta: `{ "data": ... }`. Login/sesión: `{ "user": ..., "csrfToken": "..." }`. Error: `{ "error": { "code": "...", "message": "...", "details": {} } }`, con `details` opcional. El cliente muestra `message` y decide según HTTP/`code`.

Identificadores enteros positivos y booleanos JSON verdaderos, no cadenas. Algunos SQL `numeric` llegan como cadenas decimales. Enviar fechas ISO 8601 con zona explícita (`Z` o `-05:00`); se guardan con `timestamptz`. El frontend presenta America/Lima. Límite de cuerpo: 64 KB.

No hay borrado físico desde el API: se cancelan registros para conservar historial. Listados ordenados por creación descendente, máximo 200 registros por consulta en este MVP, sin paginación. Los filtros nunca amplían los permisos.

## Sesión, cookie, CSRF y origen

1. `POST /auth/login` con `{correo,contrasena}` devuelve usuario/token CSRF y fija `realimenta_session` con `HttpOnly`, `SameSite=Lax`, `Path=/` y duración predeterminada de 8 horas. En producción añade `Secure` y necesita HTTPS.
2. La cookie contiene un identificador aleatorio; PostgreSQL guarda su SHA-256, actor, CSRF y expiración. La sesión sobrevive al reinicio hasta vencer o cerrarse. El navegador usa `credentials:'same-origin'`, sin leer la cookie desde JS.
3. Al cargar una página, `GET /auth/me` recupera usuario y CSRF. Toda mutación autenticada envía cabecera `x-csrf-token`, además de cookie. Login y registro son las excepciones CSRF.
4. Se valida `Origin` y `Sec-Fetch-Site` en escritura. `APP_ORIGIN` configura el origen; también se admiten localhost/127.0.0.1 con el puerto local configurado. No hay CORS abierto.
5. `POST /auth/logout` elimina la sesión PG y la cookie. Una sesión vencida/inactiva produce `401`.

Contraseñas scrypt con sal aleatoria; no se retornan hashes ni claves privadas. Respuestas API `Cache-Control:no-store`. CSP restringe scripts al propio origen, sin `unsafe-inline`; páginas de panel autorizadas también en servidor.

## Endpoints públicos y autenticación

| Método y ruta | Permiso | Entrada / salida |
| --- | --- | --- |
| `GET /health` | Público | `data.status`, `postgres`, `database`, `server_time`, `timezone`; `503` si PG falla. |
| `GET /public/stats` | Público | Conteos SQL, incluidas cuentas demo; no son métricas de impacto. |
| `GET /geocode?q=...` | Público | Consulta manual de 3–200 caracteres; hasta 5 resultados `{display_name,latitud,longitud,proveedor}`. |
| `POST /auth/register` | Público | Cuenta donante/organización y perfil confirmado; `201 data` pendiente. |
| `POST /auth/login` | Público | `{correo,contrasena}`; usuario, CSRF y cookie. |
| `GET /auth/me` | Sesión | `{user,csrfToken}`; user incluye perfil del rol. |
| `POST /auth/logout` | Sesión + CSRF | Sin campos obligatorios; `data.message`. |

Límite defensivo login/registro: 60 intentos por IP/15 minutos en una instancia. Geocodificación: 10 consultas por IP/minuto y cola global de 1,1 segundos entre llamadas al proveedor. Para varias instancias se requiere limitador compartido.

### Registro

```json
{
  "nombre": "Responsable de la cuenta",
  "correo": "responsable@example.org",
  "contrasena": "una-contraseña-de-12-a-128-caracteres",
  "telefono": "999999999",
  "rol": "donante",
  "perfil": {
    "nombre_establecimiento": "Nombre del establecimiento",
    "departamento": "Puno",
    "provincia": "Puno",
    "distrito": "Puno",
    "direccion": "Dirección confirmada por el usuario",
    "referencia": "Referencia opcional",
    "latitud": -15.840908,
    "longitud": -70.0289581,
    "ubicacion_confirmada": true
  }
}
```

Para organización, `perfil` usa `nombre` y `responsable` en lugar de `nombre_establecimiento`. Contraseña de 12–128 caracteres. No se admite administrador público ni estado de verificación impuesto por cliente. Las cuentas quedan pendientes; la aprobación administrativa todavía no tiene endpoint. Las cuentas verificadas de demostración se crean por semilla.

## Donaciones

| Método/ruta | Permiso y regla | Resultado |
| --- | --- | --- |
| `GET /donaciones` | Donante: propias. Organización: disponibles de donantes verificados/activos. Admin: todas. | Arreglo `data` con `donante_nombre`, objeto `donante`, `solicitudes_count`. |
| `POST /donaciones` | Donante verificado + CSRF. | `201 data` persistida. |
| `GET /donaciones/:id` | Propietario/admin; organización si disponible o con solicitud propia al cerrarse. | Detalle y solicitudes autorizadas. |
| `PATCH /donaciones/:id` | Propietario verificado, disponible y sin solicitudes activas. | `200 data`; admite parcial. |
| `POST /donaciones/:id/cancelar` | Propietario, disponible/en proceso; `{motivo}` de 5–1000 caracteres. | Cancela publicación y solicitudes activas en transacción. |

Filtros: `q`, `categoria`, `distrito`, `estado`. El frontend envía `scope=mine|all` como intención, pero el servidor impone el alcance por rol; no elude propiedad. Las organizaciones reciben siempre el catálogo elegible.

| Campo POST/PATCH | Validación |
| --- | --- |
| `alimento`, `categoria` | 2–180 y 2–100 caracteres. |
| `cantidad`, `unidad` | 0,001–999999999 y texto 1–40. |
| `descripcion`, `observaciones` | Opcionales, hasta 2500 cada uno. |
| `fecha_disponibilidad` | Fecha con zona; admite disponibilidad inmediata/pasada. |
| `fecha_limite_recojo` | Posterior a disponibilidad y al instante del servidor al guardar. |
| `fecha_limite_aprovechamiento_declarada` | Opcional; si existe, igual o posterior a límite de recojo. |
| `direccion_recojo`, `distrito` | 5–300 y 2–100 caracteres. |
| `latitud_recojo`, `longitud_recojo` | Números [-90,90] y [-180,180]. |
| `conservacion_declarada` | Obligatoria, 3–1000 caracteres. |
| `requiere_cadena_frio` | Booleano obligatorio. |
| `temperatura_declarada` | Texto opcional hasta 100; no impone umbral sanitario. |
| `envase` | Obligatorio, 2–300 caracteres. |

Estados: `disponible`, `en_proceso`, `cancelada`, `vencida`. El cliente no puede imponerlos en POST/PATCH. Se vencen publicaciones disponibles al alcanzar límite de recojo/aprovechamiento, antes de operaciones y cada minuto; se rechazan pendientes con auditoría. Las fechas de recojo y aprovechamiento son distintas y el límite declarado no certifica inocuidad.

## Solicitudes

| Método/ruta | Permiso/regla | Resultado |
| --- | --- | --- |
| `GET /solicitudes` | Organización propias, donante recibidas en sus publicaciones, admin todas. | Incluye `donacion`, `organizacion`, `donante` y última `evaluacion_ruta` si existe. |
| `POST /donaciones/:id/solicitudes` | Organización verificada; donación disponible; fecha futura dentro de ventana. | `201 data`. |
| `POST /solicitudes/:id/aceptar` | Donante propietario; pendiente y publicación disponible. | Elegida aceptada, otras pendientes rechazadas y donación en proceso. |
| `POST /solicitudes/:id/rechazar` | Donante propietario; pendiente; motivo 5–1000. | `200 data`. |
| `POST /solicitudes/:id/cancelar` | Organización propietaria; pendiente; motivo 5–1000. | `200 data`. |

GET admite `id_donacion` y `estado`. POST requiere `responsable_recojo` (2–160), `telefono` (6–40), `transporte_declarado` y `recipiente_declarado` (2–300), `fecha_propuesta` ISO con zona. Admite `dispone_cadena_frio` booleano (false por defecto) y `observaciones` opcional hasta 2500.

Se solicita la donación completa, sin `cantidad_solicitada` ni fraccionamiento. No pueden coexistir dos solicitudes activas (`pendiente`/`aceptada`) de una organización para una donación. Tras rechazo/cancelación puede reenviar si sigue disponible.

Aceptar admite `{motivo}` opcional. La transacción bloquea primero la fila de donación `FOR UPDATE`. El índice parcial `solicitud_unica_aceptada` garantiza como máximo una aceptada en PostgreSQL. Dos aceptaciones concurrentes producen un éxito y un `409`, no dos reservas. La organización no cancela aceptadas en este alcance. Cancelar la donación cancela también sus solicitudes pendientes/aceptadas con motivo y auditoría.

## Evaluación de ruta

`POST /donaciones/:id/evaluacion`, sesión + CSRF. Organización: ubicación de su perfil. Donante propietario/admin: exige `id_solicitud` de la donación para identificar destino. La organización solo evalúa publicaciones elegibles disponibles o con solicitud propia.

Entrada opcional: `preparacion_min`, `recojo_min`, `entrega_min`, `margen_seguridad_min` (0–1440), `dispone_cadena_frio`, `fecha_propuesta`. Para el donante se toma la fecha de la solicitud y por defecto su declaración de frío. El umbral verde lo configura el backend con `LOGISTICS_GREEN_MARGIN_MIN`.

```text
data.ruta:
  geometry GeoJSON LineString, origen, destino, distancia_km,
  duracion_estimada_min, proveedor, fecha_calculo,
  medio_transporte, trafico_en_vivo:false
data.evaluacion:
  estado_viabilidad, mensaje, advertencias, tiempo_restante_min,
  tiempo_total_estimado_min, margen_tiempo_min, parámetros usados
```

Persiste actor, donación, organización, solicitud cuando exista, geometría y detalle en `evaluacion_ruta`. Total = espera programada + preparación + recojo + transporte real + entrega + margen. Verde: margen suficiente; amarillo: positivo reducido; rojo: tiempo insuficiente, recojo fuera de ventana o falta declarada de medios de frío; gris: información insuficiente. Es logística preliminar, no certificación sanitaria.

La cola externa limita acumulación a 12 consultas. Caché geocodificación de 24 horas y rutas de una hora; no reemplaza los registros de negocio. Los fallos no generan tiempos ficticios. La clave ORS permanece en backend.

## Perfil, auditoría y administración

| Método/ruta | Permiso | Contrato |
| --- | --- | --- |
| `GET /perfil` | Sesión | `data:{usuario:{id_usuario,nombre,correo,telefono,rol},perfil:{...}}`. |
| `PATCH /perfil` | Sesión + CSRF | `{nombre,telefono,perfil}`; coordenadas confirmadas para no administrativos; no modifica correo/rol/verificación. |
| `GET /auditoria` | Sesión | Donante: actor y operaciones propias; organización: actor/solicitudes propias; admin: todos. Filtros `entidad`, `id_entidad`. |
| `GET /admin/stats` | Administrador | Conteos SQL persistidos. |

## Errores HTTP

| HTTP | Códigos representativos | Interpretación |
| --- | --- | --- |
| 400 | `INVALID_ID`, `INVALID_JSON` | Identificador/JSON inválido. |
| 401 | `AUTH_REQUIRED`, `INVALID_CREDENTIALS` | Sesión ausente o credenciales incorrectas. |
| 403 | `FORBIDDEN`, `NOT_OWNER`, `PROFILE_PENDING`, `CSRF_REQUIRED`, `INVALID_ORIGIN`, `PROHIBIDO` | Falta permiso, verificación o protección de petición. |
| 404 | `DONATION_NOT_FOUND`, `REQUEST_NOT_FOUND`, `NOT_FOUND`, `NO_ENCONTRADO` | Recurso inexistente. |
| 409 | `CONFLICT`, `DONATION_UNAVAILABLE`, `INVALID_STATE`, `DONATION_HAS_REQUESTS` | Duplicado, vencimiento, carrera/estado o edición prohibida. |
| 422 | `VALIDATION_ERROR`, `INVALID_DATES`, `INVALID_PICKUP_TIME`, `LOCATION_UNCONFIRMED`, `SIN_RUTA` | Datos inválidos o ausencia de ruta. |
| 429 | `TOO_MANY_ATTEMPTS`, `CONSULTAS_LIMITADAS` | Esperar antes de reintentar. |
| 502 | `PROVEEDOR_NO_DISPONIBLE`, `RESPUESTA_INVALIDA` | Fallo/respuesta externa inválida. |
| 503 | `DATABASE_UNAVAILABLE`, `CLAVE_RUTAS_PENDIENTE`, `PROVEEDOR_INVALIDO` | Dependencia o configuración pendiente. |
| 500 | `INTERNAL_ERROR` | Error inesperado, sin exponer SQL ni secretos. |

## Verificación

La ejecución documentada aprobó 32 pruebas con PostgreSQL aislado real y fallos externos controlados. Ver [reporte TAP](evidencias/custodia-servidor.tap), [backend](../tests/backend.test.mjs), [cálculo](../tests/logistics.test.js) y [proveedor](../tests/providers.test.mjs). La consulta de carretera real se conserva en [proveedores-reales.json](evidencias/proveedores-reales.json). Además, [ui-resumen.json](evidencias/ui-resumen.json) acredita cuatro recorridos de navegador aprobados, incluido publicar/solicitar/aceptar con ruta real. El alcance de estas pruebas no acredita toda accesibilidad ni objetivos de carga/disponibilidad.
