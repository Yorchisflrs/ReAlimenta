# Fondos locales y seguimiento — REAlimenta

Implementación local en `C:\xampp\htdocs\proyecto`, con MySQL/MariaDB de XAMPP. No se cambió la estructura de ninguna tabla ni se trasladaron registros de PostgreSQL.

## Imágenes nuevas

Se utilizó el generador de imágenes integrado (no la API/CLI). Se conservan los originales anteriores; la interfaz usa estos tres archivos nuevos:

- [Entrega comunitaria con productos locales](../assets/images/fondos/entrega-productos-locales-v2.png): edición de la portada original; conserva a la misma señora, su ropa, postura, manos, caja y paisaje. Solo cambia el contenido por pan artesanal, papa, oca, yuca y queso.
- [Pan artesanal y queso](../assets/images/fondos/pan-queso-local-v2.png): imagen nueva para publicaciones y catálogo.
- [Cosecha andina](../assets/images/fondos/cosecha-andina-v2.png): imagen nueva de papa, oca y yuca para seguimiento, detalle y perfiles.

Son recursos ilustrativos generados, no fotografías que acrediten un lote real. Las fotos que sube un donante conservan prioridad en sus tarjetas, detalle y seguimiento. Las imágenes anteriores con marca de agua no se alteraron ni se siguen usando como fondo de las vistas.

La ambientación cambia con la navegación mediante `js/ambience.js`: aplica una imagen y un degradado al fondo completo del panel, además de la cabecera. Formularios, tablas, tarjetas y mapas mantienen superficies legibles. Login, registro y recuperación también tienen fondo; hay adaptación a 360 px.

## Flujo funcional

1. Un donante verificado publica un alimento, cantidad, envase, plazos, dirección y fotografías. Debe confirmar el marcador del punto de recojo.
2. La organización consulta el catálogo y la ruta desde su propia ubicación registrada. Envía una solicitud; solicitar no reserva automáticamente el alimento.
3. El donante acepta. Se crea una asignación única y su entrega; la interfaz abre directamente el seguimiento correcto.
4. El donante registra **Preparación terminada**. La organización registra **Recojo**, **Traslado**, **Entrega** y **Confirmación**. Las transferencias requieren responsables y los hitos conservan usuario y hora del servidor.
5. Las solicitudes aceptadas incluyen **Abrir seguimiento y custodia**. El historial permanece después de recargar y para ambos participantes.

El registro de cuentas conserva su verificación pendiente: no se aprobaron automáticamente cuentas reales ni se cambiaron sus permisos.

## Dos trayectos y tiempos

- **Ida al recojo:** organización → establecimiento donante.
- **Traslado del alimento:** establecimiento donante → organización.

Cada sentido se consulta por carretera al proveedor; no se supone que la distancia o duración de vuelta sea idéntica. El mapa muestra el traslado del alimento; las dos tarjetas identifican cada sentido y sus kilómetros/minutos.

Antes del recojo, la estimación conservadora suma espera programada + preparación + viaje de ida + operación de recojo + traslado del alimento + demora manual + entrega + margen. Después del recojo no vuelve a sumar preparación, viaje de ida ni operación de recojo.

Las direcciones y coordenadas proceden de cada publicación y del perfil de su organización, no de un ejemplo fijo. Para un caso de Avenida Panamá–Salcedo, se debe escribir el número correcto y confirmar ambos puntos en el mapa; no se inventa una ubicación exacta a partir del nombre del barrio. Cambiar el texto de la dirección exige confirmar nuevamente el marcador. Un cambio de coordenadas invalida el plan anterior y exige recalcular.

La demora elegida es un **escenario manual**, no tráfico en vivo. El semáforo evalúa margen temporal, plazos y condiciones declaradas; no certifica inocuidad. Tampoco hay GPS ni sensores continuos.

## Persistencia sin nuevas tablas

- `evaluaciones_ruta`: distancias, duración de traslado, coordenadas, tiempos, margen, semáforo, donación, organización y solicitud.
- `auditoria.descripcion` con acción `calcular`: parámetros de planificación y resumen de la ruta de ida. Se insertan en la misma transacción que la evaluación.
- `entregas`, `seguimientos`, `incidencias`: entrega y eventos de custodia existentes.

Reabrir una entrega conserva la demora y el margen seleccionados; no vuelve silenciosamente a cero. La geometría se consulta o se reutiliza desde caché; no se añade una columna para polilíneas. Si el proveedor falla, se informa del fallo y no se inventan kilómetros ni minutos.

## Prompts finales

### entrega-local

Use case: precise-object-edit / identity-preserve. Edit target: the supplied REAlimenta website hero photograph. Change ONLY the contents inside the wooden donation box: locally sourced artisan Andean bread rolls, clean native potatoes, recognizable elongated yellow and pink oca tubers, a few yuca roots, and a neatly wrapped round fresh artisanal cheese. Real food, realistic sizes and perspective, clean donation packaging, cheese separated from raw roots. Keep the SAME woman, her body, hands, exact pose, colorful woven shawl, sweater, skirt, the other person's hands and clothing, wooden box, Lake Titicaca, buildings, background, golden daylight, crop, lens and photographic style unchanged. Do not add or reveal a face not present in the input. Preserve the wide composition. No typography, logos, labels or watermarks. Photorealistic natural food textures. This is an illustrative website asset, not evidence of an actual donation.

### pan-queso-local

Use case: photorealistic-natural. Asset type: high-quality wide landscape background photo for REAlimenta, a food donation platform in Puno, Peru. Scene: a clean wooden bakery table, artisan Andean bread rolls with crisp rustic crust and a round artisanal fresh cheese on a separate clean wooden board, cream linen, soft natural morning light. Subject on the RIGHT half because the existing website places readable text on the left. Left half simple softly out-of-focus neutral warm background with subtle sage tones, no text baked in, no artificial gradient baked in. Editorial food photography, realistic crumb, subtle imperfections, appetizing but honest, warm inviting mood, crisp detailed food, landscape 16:9. No people, no brand, no writing, no watermark, no plastic-looking food, no collage. Newly composed original illustration, not a copy of any supplied photograph.

### cosecha-andina

Use case: photorealistic-natural. Asset type: original wide landscape background photograph for REAlimenta food donation and pickup screens in Puno, Peru. A clean shallow produce crate with native potatoes in naturally varied tan and purple skins, unmistakable small elongated yellow and pink oca tubers, several brown yuca roots with one showing clean white flesh, on a warm stone and wood counter. Rustic local produce, high photographic detail, healthy undamaged food, clean surfaces. Composition with the produce grouped on the RIGHT half, quiet cream and olive softly out-of-focus space on the left for the existing website text and a CSS gradient. Natural diffuse Andean daylight, warm earthy colors, professional editorial photograph, landscape 16:9. No people, no text, no signs, no brands, no watermark, no collage. Do not resemble a medical or food-safety certification.
