# 4. Modelamiento preliminar de REAlimenta

> Modelo conceptual histórico del prototipo. El esquema implementado de los dos módulos está en db/migrations/001_initial.sql y sus reglas vigentes en Modulos_Funcionales_REAlimenta.md.

El presente modelo describe el sistema propuesto. Los datos y las transiciones del prototipo son visuales; las entidades no constituyen todavía una base de datos.

## 1. Actores y casos de uso principales

| Actor | Casos de uso propuestos |
| --- | --- |
| Donante | Registrarse; iniciar sesión; gestionar establecimiento; registrar, editar y cancelar donación; consultar solicitudes; aceptar o rechazar una solicitud; preparar donación; registrar entrega; consultar seguimiento y notificaciones. |
| Organización beneficiaria | Registrarse; iniciar sesión; gestionar organización; consultar donaciones y ver detalle; solicitar donación; consultar o cancelar solicitud; consultar recojo; confirmar recepción; consultar seguimiento y notificaciones. |
| Administrador | Gestionar usuarios, organizaciones, donantes y donaciones; consultar solicitudes; gestionar verificaciones; consultar seguimientos, incidencias y reportes. |

## 2. Flujo principal corregido

```text
Donante publica → Donación disponible → Organización consulta
→ Organización solicita → Solicitud pendiente → Donante revisa
                                      ├─ Rechaza → Final de esa solicitud
                                      └─ Acepta → Organización seleccionada
                                                  → Preparar donación
                                                  → Lista para recojo
                                                  → Recojo → Traslado → Entrega
                                                  → Confirmación de recepción
                                                  → Finalización
```

Una donación puede tener varias solicitudes pendientes. En el ejemplo DON-001, SOL-001, SOL-002 y SOL-003 pueden solicitarla. Si se elige SOL-002, esta queda **Aceptada**; SOL-001 y SOL-003 quedan **Rechazadas / no seleccionadas**. «Entregada» corresponde después al proceso de la donación, nunca al estado de esas solicitudes. La organización designa al representante del recojo y el seguimiento identifica a quien asume la custodia en cada transferencia.

## 3. Cuatro conceptos de estado independientes

| Concepto | Valores preliminares / interpretación |
| --- | --- |
| Estado del producto | Apto para recojo; Requiere consumo inmediato; Próximo a fecha límite; Otro. Declaración del donante, no certificación sanitaria. |
| Estado de la donación | Disponible; En proceso; Finalizada; Expirada; Cancelada. Resume la publicación y su disponibilidad general. |
| Estado de solicitud | Pendiente; En revisión; Aceptada; Rechazada; Cancelada. Pertenece a una petición concreta. |
| Etapa logística / seguimiento | Publicada → Solicitud recibida → Solicitud aceptada → Preparando para recojo → Lista para recojo → En recojo → En traslado → Entregada → Recepción confirmada → Finalizada. |

**Excepciones**, fuera de la secuencia normal: Expirada, Cancelada, Solicitud rechazada, No recogida e Incidencia registrada. Su relación precisa con cada entidad deberá formalizarse antes de programar reglas definitivas.

## 4. Entidades preliminares

Los nombres siguientes sirven para analizar datos y relaciones, no son tablas creadas. Los campos de contraseñas requerirían almacenamiento seguro mediante hash en una implementación futura; no se almacenan en este prototipo.

| Entidad | Atributos preliminares |
| --- | --- |
| Usuario | id_usuario, nombre, correo, contraseña, telefono, tipo_usuario, estado |
| Donante | id_donante, id_usuario, nombre_establecimiento, ruc, tipo_establecimiento, direccion, distrito, estado_verificacion |
| Organizacion | id_organizacion, id_usuario, nombre, tipo, responsable, beneficiarios, direccion, distrito, estado_verificacion |
| Donacion | id_donacion, id_donante, alimento, categoria, cantidad, unidad, descripcion, fecha_disponibilidad, fecha_limite, estado_donacion |
| Conservacion | id_conservacion, id_donacion, condicion, requiere_cadena_frio, temperatura_referencia, observaciones |
| Envase | id_envase, id_donacion, tipo_envase, estado_envase, cantidad_recipientes, proporcionado_por, observaciones |
| Solicitud | id_solicitud, id_donacion, id_organizacion, fecha, cantidad_solicitada, responsable_recojo, fecha_propuesta, hora_propuesta, mensaje, estado_solicitud |
| Seguimiento | id_seguimiento, id_donacion, etapa, fecha, hora, responsable, observacion |
| Entrega | id_entrega, id_donacion, fecha, hora, responsable_entrega, responsable_recepcion, estado |
| Notificacion | id_notificacion, id_usuario, tipo, mensaje, fecha, leida, referencia |
| Incidencia | id_incidencia, id_donacion, tipo, descripcion, fecha, estado |

### Relaciones iniciales

Un Usuario puede representar un Donante o una Organizacion según rol. Un Donante registra muchas Donaciones. Cada Donacion puede relacionarse con una Conservacion, un Envase, muchas Solicitudes, varios hitos de Seguimiento, una Entrega y posibles Incidencias. Una Organizacion crea muchas Solicitudes; como máximo una solicitud por donación puede quedar aceptada. Una Notificacion pertenece a un Usuario y referencia un evento o entidad. Cardinalidades, restricciones y tratamiento de solicitudes parciales requieren análisis posterior.

## 5. Observaciones por proceso

Se distinguen observaciones del alimento, conservación, envase, indicaciones de recojo, observaciones de solicitud, entrega, recepción e incidencia. No se reemplazan por un único comentario genérico, pues cada una documenta una decisión o transferencia diferente.

## 6. Validación técnica pendiente

La clasificación, vida útil aprovechable, conservación, temperatura, transporte, envase, manipulación, cadena de frío y criterios de aceptación o rechazo deben revisarse con profesionales competentes de Nutrición e Ingeniería Agroindustrial. No se han definido umbrales oficiales ni certificaciones sanitarias.
