-- Actualización de la base `realimenta` (18/11/2026): expediente de verificación de cuentas.
--  1. organizaciones.codigo_registro: código RUNOC o RUOS que registra el administrador (opcional).
--  2. subsanacion_habilitada: el administrador permite presentar documentación adicional tras un rechazo subsanable.
--  3. verificaciones: historial de cada evaluación (tipo, resultado, código o RUC, observaciones, motivo, fecha y administrador).
--  4. verificacion_documentos: documentación de respaldo adjunta (archivos en uploads/verificaciones).
-- Ejecutar UNA sola vez sobre una base ya creada (phpMyAdmin > realimenta > SQL, o
-- mysql -u root realimenta -e "source db/actualizar_verificacion.sql"). No borra ni modifica datos existentes.
-- Requiere haber ejecutado antes db/actualizar_modulos_definitivos.sql.

ALTER TABLE `organizaciones`
  ADD COLUMN `codigo_registro` varchar(50) DEFAULT NULL,
  ADD COLUMN `subsanacion_habilitada` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `donantes`
  ADD COLUMN `subsanacion_habilitada` tinyint(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `verificaciones` (
  `id_verificacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `id_administrador` int(11) DEFAULT NULL,
  `tipo_verificacion` varchar(300) DEFAULT NULL,
  `resultado` varchar(30) NOT NULL,
  `estado_anterior` varchar(30) DEFAULT NULL,
  `codigo_registro` varchar(50) DEFAULT NULL,
  `ruc` varchar(20) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `motivo` text DEFAULT NULL,
  `subsanable` tinyint(1) NOT NULL DEFAULT 0,
  `fecha` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_verificacion`),
  KEY `id_usuario` (`id_usuario`),
  KEY `id_administrador` (`id_administrador`),
  CONSTRAINT `verificaciones_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`),
  CONSTRAINT `verificaciones_ibfk_2` FOREIGN KEY (`id_administrador`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `verificacion_documentos` (
  `id_documento` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `id_verificacion` int(11) DEFAULT NULL,
  `id_subido_por` int(11) DEFAULT NULL,
  `origen` varchar(20) NOT NULL DEFAULT 'administrador',
  `nombre_original` varchar(255) NOT NULL,
  `nombre_archivo` varchar(100) NOT NULL,
  `tipo_mime` varchar(100) NOT NULL,
  `tamano_bytes` int(11) NOT NULL,
  `fecha` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_documento`),
  UNIQUE KEY `nombre_archivo` (`nombre_archivo`),
  KEY `id_usuario` (`id_usuario`),
  KEY `id_verificacion` (`id_verificacion`),
  CONSTRAINT `verificacion_documentos_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`),
  CONSTRAINT `verificacion_documentos_ibfk_2` FOREIGN KEY (`id_verificacion`) REFERENCES `verificaciones` (`id_verificacion`) ON DELETE SET NULL,
  CONSTRAINT `verificacion_documentos_ibfk_3` FOREIGN KEY (`id_subido_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
