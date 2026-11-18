-- Recuperación por correo: solo se guarda el hash, una caducidad y la huella de la contraseña.
CREATE TABLE IF NOT EXISTS `recuperacion_contrasenas` (
  `id_usuario` int(11) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `password_huella` char(64) NOT NULL,
  `vence` datetime NOT NULL,
  `creado` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_usuario`),
  CONSTRAINT `recuperacion_usuario_fk` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
