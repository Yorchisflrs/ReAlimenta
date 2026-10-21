# Diagnóstico de REAlimenta antes del MVP

Fecha: 20 de octubre de 2026. Auditoría realizada antes de modificar la implementación.

## Estado encontrado

- Frontend HTML5, CSS3 y JavaScript Vanilla; seis páginas y una imagen local.
- Componentes reutilizables: navegación pública, sidebar, topbar, tarjetas, formularios, tablas y estilos de marca.
- `js/app.js` y `js/prototipo.js` ejecutan dos sistemas de navegación y modales. Los formularios y botones operan solo sobre datos demostrativos.
- No existen backend, API, conexión a base de datos, autenticación real, autorización ni pruebas.
- Las cuentas y roles de los paneles se fijan en HTML; las páginas son accesibles directamente.
- No hay PostgreSQL ni Docker instalados en las ubicaciones habituales del entorno. Node.js 24 y npm están disponibles.

## Errores observados

1. Crear una donación agrega un registro en memoria del donante, pero no en el catálogo de la organización; además se descartan varios campos.
2. El seguimiento está fijado a una donación y solicitud de ejemplo; no corresponde a cada operación.
3. Las decisiones de solicitudes no se sincronizan entre roles ni sobreviven una recarga.
4. El catálogo incluye como disponible una donación que otra vista muestra en proceso.
5. El registro no comprueba coincidencia de contraseñas ni todos los datos específicos del rol.
6. Los contadores, notificaciones, verificaciones e indicadores son ficticios.
7. La doble navegación puede dejar dos opciones activas; los modales no manejan el foco de forma uniforme.

## Intervención acordada por el prompt

Se conservan las páginas y el frontend Vanilla. Una sola capa cliente consumirá una API Express y PostgreSQL real. Los módulos de donaciones y solicitudes tendrán persistencia y reglas en el servidor. Se añadirán geocodificación, rutas de carretera y evaluación temporal. Las demás vistas se conservarán como pendientes claramente identificadas cuando no exista implementación real. No se atribuirá capacidad sanitaria al semáforo.
