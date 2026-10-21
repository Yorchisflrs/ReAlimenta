# Fondos fotográficos de REAlimenta

Las cinco fotografías de esta ampliación fueron facilitadas por el usuario. Se copiaron como archivos binarios íntegros a `assets/images/fondos/`: no se regeneraron, retocaron ni alteraron sus píxeles.

| Archivo proporcionado | Recurso local | Uso principal |
| --- | --- | --- |
| `imagen_1.jpg.jpeg` | `feria-gastronomica-puno.jpeg` | Vista general, registro y cierre de la portada. |
| `imagen_2.jpg.jpeg` | `trucha-plato-andino.jpeg` | Seguimiento, detalle de donación y acceso. |
| `imagen_3.png` | `plato-tradicional-andino.png` | Solicitudes e historial. |
| `imagen_4.jpg.jpeg` | `pan-artesanal-marca-original.jpeg` | Formulario de nueva donación y edición. |
| `imagen_5.jpg.jpeg` | `quesos-artesanales.jpeg` | Catálogo, mis donaciones y perfil. |

La fotografía de pan conserva la marca de agua y el pie originales de Depositphotos. Se muestra completa mediante `background-size: contain`, sin recorte y sin un degradado superpuesto sobre el contenido marcado. La imagen sigue siendo un recurso suministrado con marca de agua; el proyecto no afirma disponer de una licencia comercial. Si se distribuye el proyecto con otra finalidad, corresponde obtener una versión autorizada o sustituirla por una fotografía propia, sin eliminar marcas.

Los demás fondos utilizan degradados CSS crema y esmeralda para conservar la lectura de los títulos. Las tarjetas, formularios, tablas y mapas permanecen sobre superficies sólidas. Estas fotografías son ambientación de la interfaz: no identifican ni acreditan el contenido de una donación específica.

## Integración

- Cargar `css/ambience.css` después de los estilos de la aplicación.
- Cargar `js/ambience.js` en las páginas públicas y en los tres paneles.
- Después de reemplazar el contenido de una vista, llamar a `window.REAAmbience?.apply(nombreVista, rol)`.
- La función añade una composición visual al encabezado `.mvp-page-header` y actualiza `body[data-ambient]` y `body[data-ambient-view]`.
- Las páginas `login.html`, `registro.html` e `index.html` se detectan automáticamente al cargar el documento.
- `window.REAAmbience.assets` y `.views` permiten comprobar el mapa de recursos sin consultar datos de usuarios.

La capa visual no realiza peticiones de datos, no modifica los flujos de autenticación y no interviene en los controles de mapas. No requiere bibliotecas adicionales ni generación de imágenes.

## Comprobación

Se compararon las huellas SHA-256 de cada original y su copia para verificar identidad binaria. La sintaxis de `js/ambience.js` se comprueba con `node --check js/ambience.js`. La comprobación visual debe incluir vista general, catálogo, solicitudes, seguimiento y formulario; en este último debe verse el pie completo con marca de agua en escritorio y móvil.
