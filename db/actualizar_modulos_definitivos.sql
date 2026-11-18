-- Actualización de la base `realimenta` (15/11/2026): módulos definitivos.
--  1. Estado de verificación "en_revision" (en proceso) para donantes y beneficiarias.
--  2. Tabla `catalogos`: listas que el administrador puede ampliar o reducir
--     (tipos de beneficiaria y tipos de alimento), con los valores que ya usaba el sistema.
-- Ejecutar UNA sola vez sobre una base ya creada (phpMyAdmin > realimenta > SQL, o
-- mysql -u root realimenta < db/actualizar_modulos_definitivos.sql). No borra ni modifica datos existentes.
-- La base creada con db/realimenta_completa.sql ya incluye estos cambios.

ALTER TABLE `donantes`
  MODIFY `estado_verificacion` enum('pendiente','en_revision','verificado','rechazado') DEFAULT 'pendiente';
ALTER TABLE `organizaciones`
  MODIFY `estado_verificacion` enum('pendiente','en_revision','verificado','rechazado') DEFAULT 'pendiente';

CREATE TABLE IF NOT EXISTS `catalogos` (
  `id_catalogo` int(11) NOT NULL AUTO_INCREMENT,
  `tipo` varchar(50) NOT NULL,
  `valor` varchar(150) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `orden` int(11) NOT NULL DEFAULT 0,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_catalogo`),
  UNIQUE KEY `catalogo_unico` (`tipo`,`valor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `catalogos` (`tipo`, `valor`, `orden`) VALUES
  ('tipo_organizacion', 'Olla Común', 1),
  ('tipo_organizacion', 'Comedor Popular', 2),
  ('tipo_organizacion', 'Vaso de Leche', 3),
  ('tipo_alimento', 'Abarrotes y alimentos secos', 1),
  ('tipo_alimento', 'Conservas y enlatados', 2),
  ('tipo_alimento', 'Verduras, tubérculos y frutas', 3),
  ('tipo_alimento', 'Carnes, pescados y huevos', 4),
  ('tipo_alimento', 'Lácteos y derivados', 5),
  ('tipo_alimento', 'Panadería y complementos', 6),
  ('tipo_alimento', 'Alimentos preparados', 7);
