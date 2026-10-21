# Fotografías y recuperación demostrativa

Actualización del 21 de octubre de 2026. El proyecto mantiene la aplicación local existente; no se publicó en internet.

## Publicar con fotografías

En Donante → Publicar donación aparece un selector de fotografías y sus vistas previas. Admite hasta tres archivos JPG, PNG o WebP, con un máximo de 5 MB y 25 megapíxeles por imagen. La primera es la portada; las adicionales aparecen en el detalle. Antes de guardar se puede quitar una imagen de la selección.

Las fotos se suben realmente al backend después de guardar la publicación. PostgreSQL conserva su relación con el lote; los archivos se guardan en `.local/uploads/donaciones/`, fuera del código publicado. La imagen original se decodifica, se orienta y se recodifica a WebP con un lado máximo de 1600 píxeles, sin metadatos EXIF. No se aceptan SVG, GIF ni documentos renombrados. El procesamiento usa [Sharp](https://sharp.pixelplumbing.com/api-output/) y no identifica la aptitud de consumo del alimento.

Solo el donante propietario verificado puede cargar fotos de una donación disponible sin solicitudes activas. Un bloqueo transaccional impide superar tres archivos por cargas simultáneas. La lectura de los archivos requiere una sesión y permisos sobre la publicación. Donante, organización y administración ven la foto según los permisos del catálogo y de las solicitudes; no se publica el directorio de almacenamiento.

Si la publicación se guarda pero falla una foto, el formulario informa el identificador y permite reintentar sobre la misma donación, sin crear otra. Si no hay fotos propias, se conserva la imagen referencial. Las imágenes aportadas por el donante se distinguen con la etiqueta Foto del donante; tampoco constituyen verificación sanitaria.

Se deben respaldar conjuntamente PostgreSQL y `.local/uploads/donaciones/`. Las copias locales y sus claves no deben subirse indiscriminadamente a un repositorio público.

## Recuperar una cuenta de demostración

En Inicio de sesión está el enlace ¿Olvidaste tu contraseña? La pantalla indica de forma visible que es una simulación académica local y que no envía correos reales.

El proceso permite:

1. Escribir el correo de una cuenta demo de donante u organización.
2. Consultar un código en la bandeja simulada y usarlo en el formulario.
3. Escribir y confirmar una nueva contraseña de 12 a 128 caracteres.
4. Guardar e iniciar sesión con la nueva contraseña. Las sesiones anteriores se revocan.

El código aleatorio vence en diez minutos y solo puede usarse una vez. PostgreSQL conserva su hash, no el código en texto. Pedir otro invalida el anterior. Los intentos tienen límites por correo e IP. El historial de auditoría no guarda el código ni la contraseña.

La simulación está desactivada en producción. No emite códigos para cuentas reales, administradores, usuarios inactivos ni correos inexistentes. Para estos casos devuelve el mismo mensaje general. La recuperación real requiere un canal de correo verificado o un procedimiento administrativo adicional; no se puede restablecer una cuenta real con solo conocer su correo.

La cuenta aislada `recovery.ui@realimenta.test` se prepara con `node scripts/prepare-recovery-demo.mjs` para comprobar el flujo sin cambiar las cuentas principales. La prueba de navegador cambia únicamente esa cuenta. Si se cambia la contraseña de otra cuenta demo, los botones que rellenan la contraseña inicial ya no servirán para ella: se debe ingresar la nueva manualmente.

## Fondos aportados por el usuario

Las cinco imágenes se copiaron intactas a `assets/images/fondos/`. Cada vista recibe una fotografía con degradados y texto legible: feria en el panel principal/registro/recuperación, quesos en catálogo/perfil, plato tradicional en solicitudes/incidencias, trucha en seguimiento/acceso y pan en publicación. La fotografía del pan mantiene completa su marca de agua original y no se utiliza como evidencia de licencia. Ver [Fondos de la interfaz](Fondos_interfaz.md).

## API incorporada

| Método | Ruta | Función |
| --- | --- | --- |
| POST | /api/donaciones/:id/foto | Foto binaria con Content-Type admitido, sesión y CSRF |
| GET | /media/donaciones/:archivo | Imagen WebP accesible solo a un usuario autorizado |
| POST | /api/auth/recuperacion/solicitar | Solicitud genérica y código exclusivamente demo local |
| POST | /api/auth/recuperacion/restablecer | Cambiar contraseña con correo y código válido |

Las migraciones 003 y 004 son aditivas; no eliminan registros ni cambian las credenciales de las cuentas principales. Ejecutar `npm run db:migrate` al preparar otra instalación.
