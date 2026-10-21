# 3. Arquitectura propuesta para una implementación futura

> Documento histórico anterior al backend. La arquitectura actual usa Express y PostgreSQL real; consulte README.md y API_REAlimenta.md para la implementación vigente.

La versión actual de REAlimenta es un prototipo local de HTML, CSS y JavaScript. La siguiente arquitectura **no está implementada** y debe revisarse cuando se definan requisitos reales de seguridad, disponibilidad y validación técnica.

## Arquitectura cliente-servidor en tres capas

```text
┌───────────────────────────┐
│     Cliente / Navegador   │
│       Frontend web        │
└─────────────┬─────────────┘
              │ HTTP / HTTPS
              ▼
┌───────────────────────────┐
│         API REST          │
│    Node.js + Express      │
│    Lógica de negocio      │
└─────────────┬─────────────┘
              │ Acceso a datos
              ▼
┌───────────────────────────┐
│        PostgreSQL         │
│       Base de datos       │
└───────────────────────────┘
```

### Capa de presentación

El frontend web mostraría catálogos, formularios, estados, alertas y paneles por rol. Enviaría acciones al servicio y presentaría sus respuestas. No debería decidir por sí solo la aceptación definitiva de solicitudes ni almacenar credenciales de forma insegura.

### Capa de lógica de negocio

Una API REST futura con Node.js y Express comprobaría identidad y permisos, validaría datos, aplicaría la regla de una sola solicitud aceptada, registraría transiciones y generaría eventos de notificación. Los criterios técnicos de alimentos no se codificarán como reglas definitivas sin revisión especializada.

### Capa de datos

PostgreSQL almacenaría usuarios, donaciones, solicitudes, conservación, envases, seguimiento, entregas, notificaciones e incidencias con relaciones y auditoría por definir. El modelo del documento 04 es preliminar y no equivale a un esquema físico aprobado.

## Aspectos transversales por definir

Autenticación, autorización, protección de datos personales, respaldo, auditoría de eventos, gestión de archivos, accesibilidad, manejo de errores y observabilidad deberán especificarse en incrementos posteriores. El prototipo actual no usa API ni base de datos.
