-- Copia de referencia de la ESTRUCTURA de la base existente "realimenta" (XAMPP), obtenida con
-- mysqldump --no-data --skip-add-drop-table. No contiene datos.
-- USO EXCLUSIVO DE PRUEBAS: tests/helpers/mysql-sandbox.mjs la aplica en una instancia MariaDB temporal
-- y aislada. La aplicación nunca la ejecuta y NO debe ejecutarse sobre la base real.


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `asignaciones` (
  `id_asignacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_donacion` int(11) NOT NULL,
  `id_solicitud` int(11) NOT NULL,
  `fecha_asignacion` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_asignacion`),
  UNIQUE KEY `id_donacion` (`id_donacion`),
  UNIQUE KEY `id_solicitud` (`id_solicitud`),
  CONSTRAINT `asignaciones_ibfk_1` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`),
  CONSTRAINT `asignaciones_ibfk_2` FOREIGN KEY (`id_solicitud`) REFERENCES `solicitudes` (`id_solicitud`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auditoria` (
  `id_auditoria` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) DEFAULT NULL,
  `modulo` varchar(100) DEFAULT NULL,
  `accion` varchar(150) DEFAULT NULL,
  `tabla_afectada` varchar(100) DEFAULT NULL,
  `id_registro` int(11) DEFAULT NULL,
  `descripcion` text DEFAULT NULL,
  `fecha` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_auditoria`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `auditoria_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `donacion_fotos` (
  `id_foto` int(11) NOT NULL AUTO_INCREMENT,
  `id_donacion` int(11) NOT NULL,
  `nombre_original` varchar(255) DEFAULT NULL,
  `nombre_archivo` varchar(255) NOT NULL,
  `ruta_archivo` varchar(500) NOT NULL,
  `tipo_mime` varchar(100) DEFAULT NULL,
  `tamano_bytes` bigint(20) DEFAULT NULL,
  `es_principal` tinyint(1) DEFAULT 0,
  `fecha_subida` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_foto`),
  KEY `id_donacion` (`id_donacion`),
  CONSTRAINT `donacion_fotos_ibfk_1` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `donaciones` (
  `id_donacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_donante` int(11) NOT NULL,
  `nombre_alimento` varchar(200) NOT NULL,
  `categoria` varchar(100) DEFAULT NULL,
  `descripcion` text DEFAULT NULL,
  `cantidad` decimal(12,2) NOT NULL,
  `unidad` varchar(50) NOT NULL,
  `estado_producto` varchar(100) DEFAULT NULL,
  `fecha_elaboracion` datetime DEFAULT NULL,
  `fecha_vencimiento` datetime DEFAULT NULL,
  `fecha_disponibilidad` datetime NOT NULL,
  `fecha_limite_recojo` datetime NOT NULL,
  `fecha_limite_aprovechamiento` datetime DEFAULT NULL,
  `direccion_recojo` varchar(255) DEFAULT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `tipo_conservacion` varchar(100) DEFAULT NULL,
  `requiere_cadena_frio` tinyint(1) DEFAULT 0,
  `temperatura_declarada` varchar(50) DEFAULT NULL,
  `tipo_envase` varchar(100) DEFAULT NULL,
  `estado_envase` varchar(100) DEFAULT NULL,
  `indicaciones_recojo` text DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `estado` enum('disponible','en_proceso','finalizada','expirada','cancelada') DEFAULT 'disponible',
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id_donacion`),
  KEY `id_donante` (`id_donante`),
  KEY `idx_estado` (`estado`),
  KEY `idx_categoria` (`categoria`),
  KEY `idx_fecha_limite` (`fecha_limite_recojo`),
  CONSTRAINT `donaciones_ibfk_1` FOREIGN KEY (`id_donante`) REFERENCES `donantes` (`id_donante`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `donantes` (
  `id_donante` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `nombre_establecimiento` varchar(200) NOT NULL,
  `ruc` varchar(20) DEFAULT NULL,
  `tipo_establecimiento` varchar(100) DEFAULT NULL,
  `responsable` varchar(150) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `departamento` varchar(100) DEFAULT 'Puno',
  `provincia` varchar(100) DEFAULT NULL,
  `distrito` varchar(100) DEFAULT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `estado_verificacion` enum('pendiente','verificado','rechazado') DEFAULT 'pendiente',
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_donante`),
  UNIQUE KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `donantes_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `entregas` (
  `id_entrega` int(11) NOT NULL AUTO_INCREMENT,
  `id_donacion` int(11) NOT NULL,
  `id_solicitud` int(11) NOT NULL,
  `responsable_entrega` varchar(150) DEFAULT NULL,
  `responsable_recepcion` varchar(150) DEFAULT NULL,
  `cantidad_entregada` decimal(12,2) DEFAULT NULL,
  `fecha_recojo` datetime DEFAULT NULL,
  `fecha_entrega` datetime DEFAULT NULL,
  `fecha_confirmacion` datetime DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `estado` enum('pendiente','en_recojo','en_traslado','entregada','confirmada','con_incidencia') DEFAULT 'pendiente',
  PRIMARY KEY (`id_entrega`),
  UNIQUE KEY `id_donacion` (`id_donacion`),
  KEY `id_solicitud` (`id_solicitud`),
  CONSTRAINT `entregas_ibfk_1` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`),
  CONSTRAINT `entregas_ibfk_2` FOREIGN KEY (`id_solicitud`) REFERENCES `solicitudes` (`id_solicitud`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `evaluaciones_ruta` (
  `id_evaluacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_donacion` int(11) NOT NULL,
  `id_organizacion` int(11) NOT NULL,
  `id_solicitud` int(11) DEFAULT NULL,
  `origen_latitud` decimal(10,7) DEFAULT NULL,
  `origen_longitud` decimal(10,7) DEFAULT NULL,
  `destino_latitud` decimal(10,7) DEFAULT NULL,
  `destino_longitud` decimal(10,7) DEFAULT NULL,
  `distancia_km` decimal(10,2) DEFAULT NULL,
  `duracion_estimada_min` decimal(10,2) DEFAULT NULL,
  `tiempo_preparacion_min` decimal(10,2) DEFAULT NULL,
  `tiempo_recojo_min` decimal(10,2) DEFAULT NULL,
  `tiempo_entrega_min` decimal(10,2) DEFAULT NULL,
  `tiempo_total_estimado_min` decimal(10,2) DEFAULT NULL,
  `tiempo_disponible_min` decimal(10,2) DEFAULT NULL,
  `margen_tiempo_min` decimal(10,2) DEFAULT NULL,
  `semaforo` enum('verde','amarillo','rojo','gris') DEFAULT 'gris',
  `proveedor_mapa` varchar(100) DEFAULT NULL,
  `fecha_calculo` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_evaluacion`),
  KEY `id_donacion` (`id_donacion`),
  KEY `id_organizacion` (`id_organizacion`),
  KEY `id_solicitud` (`id_solicitud`),
  CONSTRAINT `evaluaciones_ruta_ibfk_1` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`),
  CONSTRAINT `evaluaciones_ruta_ibfk_2` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`),
  CONSTRAINT `evaluaciones_ruta_ibfk_3` FOREIGN KEY (`id_solicitud`) REFERENCES `solicitudes` (`id_solicitud`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `incidencias` (
  `id_incidencia` int(11) NOT NULL AUTO_INCREMENT,
  `id_donacion` int(11) NOT NULL,
  `id_solicitud` int(11) DEFAULT NULL,
  `id_usuario` int(11) DEFAULT NULL,
  `tipo` varchar(150) NOT NULL,
  `descripcion` text NOT NULL,
  `estado` enum('abierta','en_revision','resuelta','cerrada') DEFAULT 'abierta',
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_resolucion` datetime DEFAULT NULL,
  PRIMARY KEY (`id_incidencia`),
  KEY `id_donacion` (`id_donacion`),
  KEY `id_solicitud` (`id_solicitud`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `incidencias_ibfk_1` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`),
  CONSTRAINT `incidencias_ibfk_2` FOREIGN KEY (`id_solicitud`) REFERENCES `solicitudes` (`id_solicitud`),
  CONSTRAINT `incidencias_ibfk_3` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notificaciones` (
  `id_notificacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `id_donacion` int(11) DEFAULT NULL,
  `id_solicitud` int(11) DEFAULT NULL,
  `titulo` varchar(200) NOT NULL,
  `mensaje` text NOT NULL,
  `tipo` varchar(100) DEFAULT NULL,
  `leida` tinyint(1) DEFAULT 0,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_notificacion`),
  KEY `id_usuario` (`id_usuario`),
  KEY `id_donacion` (`id_donacion`),
  KEY `id_solicitud` (`id_solicitud`),
  CONSTRAINT `notificaciones_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`),
  CONSTRAINT `notificaciones_ibfk_2` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`),
  CONSTRAINT `notificaciones_ibfk_3` FOREIGN KEY (`id_solicitud`) REFERENCES `solicitudes` (`id_solicitud`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `organizaciones` (
  `id_organizacion` int(11) NOT NULL AUTO_INCREMENT,
  `id_usuario` int(11) NOT NULL,
  `nombre` varchar(200) NOT NULL,
  `tipo_organizacion` varchar(100) DEFAULT NULL,
  `responsable` varchar(150) DEFAULT NULL,
  `numero_beneficiarios` int(11) DEFAULT 0,
  `direccion` varchar(255) DEFAULT NULL,
  `departamento` varchar(100) DEFAULT 'Puno',
  `provincia` varchar(100) DEFAULT NULL,
  `distrito` varchar(100) DEFAULT NULL,
  `latitud` decimal(10,7) DEFAULT NULL,
  `longitud` decimal(10,7) DEFAULT NULL,
  `estado_verificacion` enum('pendiente','verificado','rechazado') DEFAULT 'pendiente',
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_organizacion`),
  UNIQUE KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `organizaciones_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `seguimientos` (
  `id_seguimiento` int(11) NOT NULL AUTO_INCREMENT,
  `id_donacion` int(11) NOT NULL,
  `id_usuario` int(11) DEFAULT NULL,
  `etapa` enum('publicada','solicitud_recibida','solicitud_aceptada','preparando','lista_recojo','en_recojo','en_traslado','entregada','recepcion_confirmada','finalizada') NOT NULL,
  `responsable` varchar(150) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `fecha_evento` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_seguimiento`),
  KEY `id_donacion` (`id_donacion`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `seguimientos_ibfk_1` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`),
  CONSTRAINT `seguimientos_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `solicitudes` (
  `id_solicitud` int(11) NOT NULL AUTO_INCREMENT,
  `id_donacion` int(11) NOT NULL,
  `id_organizacion` int(11) NOT NULL,
  `cantidad_solicitada` decimal(12,2) DEFAULT NULL,
  `responsable_recojo` varchar(150) DEFAULT NULL,
  `telefono_recojo` varchar(20) DEFAULT NULL,
  `fecha_recojo_propuesta` datetime DEFAULT NULL,
  `tipo_transporte` varchar(100) DEFAULT NULL,
  `recipiente` varchar(100) DEFAULT NULL,
  `mensaje` text DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `estado` enum('pendiente','en_revision','aceptada','rechazada','cancelada') DEFAULT 'pendiente',
  `fecha_solicitud` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_solicitud`),
  UNIQUE KEY `solicitud_unica` (`id_donacion`,`id_organizacion`),
  KEY `id_organizacion` (`id_organizacion`),
  CONSTRAINT `solicitudes_ibfk_1` FOREIGN KEY (`id_donacion`) REFERENCES `donaciones` (`id_donacion`),
  CONSTRAINT `solicitudes_ibfk_2` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usuarios` (
  `id_usuario` int(11) NOT NULL AUTO_INCREMENT,
  `nombres` varchar(150) NOT NULL,
  `apellidos` varchar(150) DEFAULT NULL,
  `correo` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `rol` enum('donante','organizacion','administrador') NOT NULL,
  `estado` enum('pendiente','activo','suspendido') DEFAULT 'pendiente',
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `correo` (`correo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

