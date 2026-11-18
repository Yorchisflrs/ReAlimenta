# REAlimenta: módulos definitivos (estado actual)

**Versión:** noviembre de 2026. Este documento reemplaza a los documentos anteriores de `docs/`, que se conservan como historial y pueden describir funciones retiradas (cálculo de rutas, semáforo logístico, custodia en seis etapas).

## 1. Módulos

| N.° | Módulo | Qué hace |
| --- | --- | --- |
| 1 | Cuentas y perfil | Registro por rol con DNI, RUC o tipo de entidad, foto del local y consentimiento de datos (Ley N.° 29733). Inicio de sesión, edición del perfil y cambio de contraseña con botón para mostrarla u ocultarla. |
| 2 | Donaciones y catálogo | El donante publica con tres fotos y declara que el alimento está en buen estado. La beneficiaria busca y filtra. Las donaciones vencen solas al terminar su plazo. |
| 3 | Solicitudes y asignación | La beneficiaria indica quién recoge y cuánto tardará en llegar. El donante acepta o rechaza, y cada donación se asigna a una sola beneficiaria. |
| 4 | Recojo, recepción e incidencias | Pasos: listo (donante), recogido (cualquiera de las dos partes) y recibido o recibido con problemas (beneficiaria). Antes del recojo se puede anular, y la donación vuelve a publicarse. |
| 5 | Notificaciones | Avisos dentro del sistema con una campana que se actualiza cada 30 segundos. |
| 6 | Comprobantes y verificación | Cada comprobante PDF lleva un código corto (Ej. `D25-7KQ4`) que se consulta en **Consultar código**. |
| 7 | Reportes de impacto | Entregas, cantidades por unidad, beneficiarias atendidas y personas estimadas, por periodo y con descarga CSV. |
| 8 | Administración y verificación | Expediente de verificación, edición de cuentas, donaciones y solicitudes, desactivación de cuentas, listas del sistema y resolución de incidencias. |

**Servicios de apoyo:**
- **Mapas:** son solo referenciales; no se calculan rutas.
- **Auditoría:** el historial de cambios.
- **Seguridad:** sesiones firmadas, CSRF y permisos por rol.
- **Base de datos:** MySQL de XAMPP.

## 2. Cómo se contactan las partes

Cuando el donante acepta una solicitud:
- **Beneficiaria:** ve el celular del donante en su solicitud aceptada y en **Recojos y entregas**.
- **Donante:** ve el celular de quien recoge, en los mismos lugares.

Hay dos botones: **Llamar**, con un enlace `tel:` que abre el teléfono, y **WhatsApp**, con un enlace `wa.me` para celulares peruanos de 9 dígitos. Antes de la aceptación no se comparte el teléfono del donante. El DNI nunca se muestra a la otra parte: solo lo ve administración.

## 3. Código de verificación

**Formato:** letra del tipo (`D` donación, `S` solicitud), número del registro, guion y 4 caracteres. Por ejemplo, `D25-7KQ4`.

**Cómo se calcula:** el servidor toma el tipo, el número y la fecha y hora exactas del registro, aplica SHA-256 y usa los primeros 4 resultados en un alfabeto sin caracteres confusos (sin 0, 1, I, L, O ni U).

**Por qué este diseño:**
- Es corto: se puede dictar o escribir.
- No se puede inventar sin conocer la fecha exacta del registro.
- No necesita una columna nueva: siempre se recalcula igual.

La versión anterior era una huella de 16 caracteres que solo calculaba el navegador y no se podía consultar.

**Consulta:** en **Consultar código** (se acepta sin guion y en minúsculas). Solo se muestra a quienes participan en el registro: el donante, la beneficiaria que lo solicitó y administración. A cualquier otra persona se le responde que no se encontró.

## 4. Expediente de verificación (solo administración)

El formulario de registro de la cuenta no cambia. La verificación es un proceso aparte que llena el administrador en **Cuentas y verificación > Expediente de verificación**.

**Datos del expediente:**
- **Código de registro** (beneficiarias, opcional y editable). La ayuda cambia según el tipo:
  - Olla común: código RUNOC.
  - Comedor popular y Comité de Vaso de Leche: código RUOS otorgado por la municipalidad.
- **RUC** (donantes): muestra el que registró el donante y el administrador lo puede corregir.
- **Documentación de respaldo:** un solo componente que admite varios archivos (PDF, JPG, PNG o WebP, hasta 10 MB cada uno). La descripción sugiere documentos según el tipo de entidad. Son referencias, no requisitos obligatorios. Los archivos se guardan en `uploads/verificaciones/` y solo los ven administración y la propia cuenta.

**Evaluación:**
- **Tipo de verificación realizada:** revisión de documentos, consulta en registro oficial, llamada o entrevista, visita, consulta a la municipalidad u otra.
- **Resultado:** en revisión, verificada o rechazada.
- **Observaciones y motivo:** el motivo es obligatorio para rechazar.

**Trazabilidad:** cada evaluación queda en `verificaciones` con fecha, administrador, resultado, tipos, código o RUC, observaciones y motivo. Los documentos se ligan a la evaluación en `verificacion_documentos`; un documento ya ligado no se puede quitar.

**Cuentas rechazadas:**
- No se borran: se conservan sus datos, documentos e historial.
- Pueden entrar a su cuenta, pero no publicar, solicitar ni aceptar solicitudes.
- Si el rechazo es subsanable, el administrador habilita una nueva evaluación y la cuenta sube documentación adicional desde **Mi perfil**. Sin esa habilitación no se puede volver a evaluar.
- **Desactivar cuenta** es una acción aparte y justificada que retira el acceso y conserva todo. Eliminar solo es posible para cuentas sin donaciones ni solicitudes, y nunca es automático.

Todas estas decisiones se notifican a la cuenta.

## 5. Lo que puede editar el administrador

- **Cuentas:** nombre, contacto, entidad, RUC, tipo, personas atendidas, DNI y dirección.
- **Donaciones disponibles o asignadas:** todos sus datos, además de cancelarlas.
- **Solicitudes pendientes:** cancelarlas. Una solicitud aceptada se anula desde el recojo.
- **Listas del sistema:** tipos de beneficiaria y tipos de alimento.
- **Verificación y acceso:** verificación, desactivación y reactivación de cuentas.
- **Incidencias:** su resolución.

Cada cambio queda en la auditoría y se avisa a las personas afectadas.

## 6. Base de datos

| Script | Cuándo |
| --- | --- |
| `db/realimenta_completa.sql` | Base nueva con datos de ejemplo (16 tablas). |
| `db/actualizar_modulos_definitivos.sql` | Base existente: estado "en revisión" y tabla `catalogos`. |
| `db/actualizar_verificacion.sql` | Base existente, después del anterior: expediente de verificación (`codigo_registro`, `subsanacion_habilitada`, `verificaciones`, `verificacion_documentos`). |

El servidor no modifica la estructura: si falta algo, no arranca e indica qué falta (`npm run db:check`).

## 7. API nueva (resumen)

| Ruta | Uso |
| --- | --- |
| `GET /api/notificaciones`, `GET /api/notificaciones/resumen`, `POST /api/notificaciones/:id/leida`, `POST /api/notificaciones/leidas` | Avisos de la cuenta. |
| `POST /api/seguimiento/:id/hitos` | Pasos `listo`, `recogido`, `confirmado`, `con_problemas` y `observacion`. |
| `POST /api/seguimiento/:id/anular` | Anular el recojo antes de recoger (`motivo`). |
| `GET /api/verificacion/codigo/:codigo` | Consulta de un comprobante. |
| `GET /api/verificacion/mi-expediente`, `POST /api/verificacion/documentos` | Estado de verificación propio y documentación adicional (solo con subsanación habilitada). |
| `GET /api/admin/cuentas`, `GET /api/admin/cuentas/:id/expediente` | Cuentas y su expediente. |
| `POST /api/admin/cuentas/:id/evaluacion`, `POST /api/admin/cuentas/:id/documentos`, `POST /api/admin/cuentas/:id/subsanacion`, `DELETE /api/admin/documentos/:id` | Evaluación, documentos y subsanación. |
| `PATCH /api/admin/cuentas/:id/datos`, `POST /api/admin/cuentas/:id/suspender`, `POST /api/admin/cuentas/:id/reactivar`, `DELETE /api/admin/cuentas/:id` | Edición, desactivación, reactivación y eliminación sin historial. |
| `PATCH /api/admin/donaciones/:id`, `POST /api/admin/donaciones/:id/cancelar`, `POST /api/admin/solicitudes/:id/cancelar` | Edición y cancelación administrativa. |
| `GET/POST/PATCH/DELETE /api/admin/catalogos` | Listas del sistema. |
| `GET /api/admin/reportes?desde=&hasta=` | Reportes de impacto. |

**Rutas retiradas:**
- `/api/rutas/estimar`
- `/api/destinos`
- `/api/donaciones/:id/evaluacion`
- `/api/seguimiento/:id/evaluacion`

## 8. Pruebas

- **`npm test`:** 63 pruebas de la API sobre una MariaDB temporal.
- **`npm run test:ui`:** 10 recorridos en Chrome, también sobre una base temporal. Ninguna de las dos escribe en la base `realimenta`.

## 9. Pendientes

- Correo real para recuperar la contraseña.
- Medio formal (por ejemplo, un documento) para comunicar las medidas del administrador; hoy se avisan dentro del sistema.
- Firmas digitales, GPS y sensores.
