# 1. Documentación inicial del proyecto REAlimenta

> Documento histórico del prototipo visual de octubre de 2026. El estado actual del MVP se documenta en README.md, Modulos_Funcionales_REAlimenta.md y Requerimientos_No_Funcionales_REAlimenta.md.

**Curso:** Taller de Desarrollo de Software  
**Naturaleza del entregable:** prototipo visual no funcional  
**Versión:** preliminar, octubre de 2026

## 1. Introducción

REAlimenta es una propuesta de sistema web para organizar la donación de excedentes alimentarios de establecimientos hacia organizaciones beneficiarias. Su propósito es hacer visible la oferta, ordenar las solicitudes y mostrar la coordinación del recojo y la recepción. El presente entregable representa el proceso mediante pantallas y datos ficticios; no presta un servicio operativo.

## 2. Descripción del problema

La coordinación informal de excedentes dificulta conocer qué alimento está disponible, durante qué periodo, en qué condiciones declaradas se conserva, quién lo recogerá y si finalmente fue recibido. Cuando varias organizaciones solicitan la misma donación, también se necesita registrar una decisión comprensible para todas las partes. La ausencia de trazabilidad y alertas oportunas puede causar duplicidad, demoras o pérdida de información relevante.

## 3. Justificación

Un flujo digital permitiría reunir los datos de alimento, conservación, envase y recojo en una publicación, comparar solicitudes y representar responsabilidades durante el traslado. Antes de construirlo como sistema real, el prototipo permite discutir requisitos con usuarios y especialistas, detectar inconsistencias y delimitar las decisiones técnicas pendientes.

## 4. Objetivo general

Diseñar un prototipo web de REAlimenta que represente la gestión integral de donaciones de alimentos entre donantes y organizaciones beneficiarias, con seguimiento diferenciado y apoyo administrativo.

## 5. Objetivos específicos

1. Representar el registro y consulta de donaciones con información de producto, conservación, envase y recojo.
2. Mostrar la recepción, revisión, aceptación o rechazo de solicitudes, permitiendo varias solicitudes por donación y una única selección.
3. Diferenciar visualmente el estado del producto, la donación, la solicitud y la etapa logística.
4. Mostrar el seguimiento, la cadena de custodia, las incidencias y las alertas vinculadas a referencias concretas.
5. Documentar el modelo de desarrollo, la arquitectura futura y las validaciones pendientes.

## 6. Alcance inicial

El prototipo incluye portada, acceso simulado y paneles para donante, organización y administrador; formularios visuales, catálogo, detalle de donación, solicitudes, recojos, seguimiento, notificaciones, incidencias y reportes ilustrativos. Los cambios hechos durante una visita a la página son demostrativos y no se persisten.

## 7. Limitaciones

No hay backend, base de datos, API, autenticación real, pagos, geolocalización real, servicio de reparto, sensores, medición de temperatura, firmas digitales ni auditoría legal. Tampoco se certifica la inocuidad de los alimentos. Los números, personas y eventos mostrados son ejemplos ficticios. La arquitectura futura está documentada, no implementada.

## 8. Actores

| Actor | Responsabilidad en el proceso propuesto |
| --- | --- |
| Donante | Publica excedentes, declara sus condiciones, evalúa solicitudes, prepara y registra la entrega. |
| Organización beneficiaria | Consulta donaciones, solicita una cantidad, organiza el recojo, transporta y confirma la recepción. |
| Administrador | Supervisa usuarios, verificaciones, donaciones, solicitudes, seguimiento, incidencias y reportes. |

## 9. Stakeholders

Además de los actores principales, se consideran responsables de establecimientos, representantes autorizados para recojo, personas beneficiarias, equipo del proyecto y profesionales de Nutrición e Ingeniería Agroindustrial. Estos últimos deberán validar los criterios técnicos antes de una implementación operativa.

## 10. Módulos conceptuales

1. Gestión de usuarios y acceso.
2. Gestión de donantes y organizaciones.
3. Gestión de donaciones.
4. Gestión de solicitudes.
5. Gestión de recojo y entrega.
6. Seguimiento y cadena de custodia.
7. Notificaciones y alertas.
8. Administración y verificación.
9. Reportes.
10. Gestión de incidencias.

Los módulos son agrupaciones funcionales; no implican diez páginas ni diez servicios separados.

## 11. Requisitos funcionales preliminares

| ID | Requisito propuesto |
| --- | --- |
| RF-01 | Permitir el registro y acceso de usuarios según rol, cuando exista implementación real. |
| RF-02 | Permitir al donante registrar, editar y cancelar donaciones. |
| RF-03 | Registrar estado declarado del producto, fechas, conservación y necesidad de cadena de frío. |
| RF-04 | Registrar envase, responsable del recipiente, modalidad y ventana de recojo. |
| RF-05 | Mostrar donaciones disponibles y su detalle a las organizaciones. |
| RF-06 | Permitir solicitar cantidad, proponer recojo y declarar transporte y recipiente. |
| RF-07 | Permitir varias solicitudes por donación disponible, pero aceptar solo una; las demás pasan a rechazadas/no seleccionadas. |
| RF-08 | Distinguir los estados de solicitud de las etapas del seguimiento. |
| RF-09 | Registrar hitos y responsables de la cadena de custodia, entrega y recepción. |
| RF-10 | Generar notificaciones referenciadas a solicitudes, donaciones, recojos o incidencias. |
| RF-11 | Permitir registrar y consultar incidencias con tipo, descripción, fecha y hora. |
| RF-12 | Dar al administrador vistas de verificación, seguimiento y reportes. |

## 12. Requisitos no funcionales preliminares

- **Usabilidad:** mensajes comprensibles y separación clara entre información del alimento, decisión de solicitud y operación logística.
- **Accesibilidad:** navegación por teclado, etiquetas de controles, contraste y adaptación a pantallas pequeñas sujetos a pruebas posteriores.
- **Seguridad futura:** autenticación, autorización por rol, protección de datos personales y trazabilidad de cambios antes de producción.
- **Disponibilidad futura:** definir objetivos de servicio, respaldo y recuperación antes del despliegue.
- **Mantenibilidad:** separar presentación, reglas de negocio y persistencia en una futura implementación; mantener vocabulario consistente.
- **Rendimiento futuro:** establecer métricas con volumen y usuarios reales durante pruebas.

Estos requisitos todavía necesitan métricas verificables y priorización con stakeholders.

## 13. Reglas de negocio preliminares

1. Una donación puede recibir varias solicitudes mientras esté disponible.
2. El donante puede seleccionar una sola solicitud por donación; las otras se muestran como rechazadas/no seleccionadas.
3. Una solicitud utiliza exclusivamente los estados: Pendiente, En revisión, Aceptada, Rechazada y Cancelada.
4. «Entregada», «Recepción confirmada» y «Finalizada» son hitos del proceso de donación, no estados de solicitud.
5. Los estados excepcionales —Expirada, Cancelada, Solicitud rechazada, No recogida e Incidencia registrada— se documentan por separado de la secuencia normal.
6. Las condiciones de conservación y temperatura son datos declarados por el donante; la plataforma no las certifica.
7. La organización designa un responsable de recojo cuando se acepta su solicitud.

Estas reglas deberán revisarse con usuarios y especialistas antes de implementación.

## 14. Validación técnica pendiente

Los criterios de clasificación del estado del alimento, tiempo máximo de aprovechamiento, conservación, temperatura, transporte, envase, manipulación, cadena de frío y aceptación o rechazo deberán revisarse y validarse posteriormente con profesionales competentes de Nutrición e Ingeniería Agroindustrial. Hasta entonces no se establecen límites sanitarios ni se afirma seguridad o aprobación oficial. El campo «Apto para recojo» es una declaración demostrativa del donante, no una certificación de REAlimenta.

## 15. Glosario básico

| Término | Significado en el prototipo |
| --- | --- |
| Donación | Publicación de un alimento, cantidad y condiciones declaradas de disponibilidad. |
| Solicitud | Petición individual de una organización sobre una donación. |
| Estado del producto | Descripción declarada de la condición del alimento; independiente del flujo. |
| Estado de la donación | Situación general de la publicación, por ejemplo Disponible, En proceso, Finalizada, Expirada o Cancelada. |
| Etapa logística | Hito temporal desde Publicada hasta Finalizada, después de la aceptación. |
| Cadena de frío | Necesidad declarada de conservar condiciones de refrigeración durante el proceso; sin monitoreo automático. |
| Cadena de custodia | Registro propuesto de responsables y transferencias durante preparación, recojo, traslado y recepción. |
| Incidencia | Evento excepcional que requiere observación y seguimiento. |
