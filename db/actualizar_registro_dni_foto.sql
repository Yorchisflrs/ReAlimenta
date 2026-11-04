-- Actualización de la base `realimenta` para el nuevo formulario de registro (29/10/2026).
-- Agrega el DNI del representante y la ruta de la foto de fachada o logo a donantes y organizaciones.
-- Ejecutar UNA sola vez sobre una base ya creada (phpMyAdmin > realimenta > SQL, o
-- mysql -u root realimenta < db/actualizar_registro_dni_foto.sql). No borra ni modifica datos existentes.
-- La base creada con db/realimenta_completa.sql ya incluye estas columnas.

ALTER TABLE `donantes`
  ADD COLUMN `dni_representante` char(8) DEFAULT NULL,
  ADD COLUMN `foto_local` varchar(255) DEFAULT NULL;

ALTER TABLE `organizaciones`
  ADD COLUMN `dni_representante` char(8) DEFAULT NULL,
  ADD COLUMN `foto_local` varchar(255) DEFAULT NULL;
