-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: realimenta
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

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

--
-- Current Database: `realimenta`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `realimenta` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `realimenta`;

--
-- Table structure for table `asignaciones`
--

DROP TABLE IF EXISTS `asignaciones`;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asignaciones`
--

LOCK TABLES `asignaciones` WRITE;
/*!40000 ALTER TABLE `asignaciones` DISABLE KEYS */;
INSERT INTO `asignaciones` VALUES (1,5,1,'2026-10-28 14:45:13');
/*!40000 ALTER TABLE `asignaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auditoria`
--

DROP TABLE IF EXISTS `auditoria`;
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
) ENGINE=InnoDB AUTO_INCREMENT=57 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auditoria`
--

LOCK TABLES `auditoria` WRITE;
/*!40000 ALTER TABLE `auditoria` DISABLE KEYS */;
INSERT INTO `auditoria` VALUES (1,1,'autenticacion','semilla_demostracion','usuarios',1,'{\"verificacion\":\"Perfil de prueba previamente verificado por semilla; no constituye una verificación administrativa real.\"}','2026-10-28 13:42:26'),(2,2,'autenticacion','semilla_demostracion','usuarios',2,'{\"verificacion\":\"Perfil de prueba previamente verificado por semilla; no constituye una verificación administrativa real.\"}','2026-10-28 13:42:26'),(3,3,'autenticacion','semilla_demostracion','usuarios',3,'{\"verificacion\":\"Perfil de prueba previamente verificado por semilla; no constituye una verificación administrativa real.\"}','2026-10-28 13:42:26'),(4,4,'autenticacion','semilla_demostracion','usuarios',4,'{\"verificacion\":\"Perfil de prueba previamente verificado por semilla; no constituye una verificación administrativa real.\"}','2026-10-28 13:42:26'),(5,1,'donaciones','semilla_demostracion','donaciones',1,'{\"marker\":\"[DEMO:SEED:PAN]\",\"fechas\":\"Relativas a la fecha real del servidor al ejecutar la semilla.\"}','2026-10-28 13:42:26'),(6,1,'donaciones','semilla_demostracion','donaciones',2,'{\"marker\":\"[DEMO:SEED:FRUTAS]\",\"fechas\":\"Relativas a la fecha real del servidor al ejecutar la semilla.\"}','2026-10-28 13:42:26'),(7,1,'donaciones','semilla_demostracion','donaciones',3,'{\"marker\":\"[DEMO:SEED:FRIO]\",\"fechas\":\"Relativas a la fecha real del servidor al ejecutar la semilla.\"}','2026-10-28 13:42:26'),(8,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 13:42:35'),(9,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 13:43:51'),(10,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 14:13:40'),(11,1,'donaciones','crear','donaciones',4,'{\"alimento\":\"Pan francés de prueba (3 fotos)\"}','2026-10-28 14:13:47'),(12,1,'fotografias','agregar_fotografia','donacion_fotos',1,'{\"id_donacion\":4,\"nombre_archivo\":\"donacion_4_ecf34d77e3278085.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":1600,\"alto\":1167}','2026-10-28 14:13:48'),(13,1,'fotografias','agregar_fotografia','donacion_fotos',2,'{\"id_donacion\":4,\"nombre_archivo\":\"donacion_4_cf75fee9865fb694.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":693,\"alto\":443}','2026-10-28 14:13:48'),(14,1,'fotografias','agregar_fotografia','donacion_fotos',3,'{\"id_donacion\":4,\"nombre_archivo\":\"donacion_4_d904ddc8d52c3cba.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":600,\"alto\":400}','2026-10-28 14:13:48'),(15,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 14:42:10'),(16,1,'donaciones','crear','donaciones',5,'{\"alimento\":\"Queso fresco de prueba (comprobante)\"}','2026-10-28 14:42:15'),(17,1,'fotografias','agregar_fotografia','donacion_fotos',4,'{\"id_donacion\":5,\"nombre_archivo\":\"donacion_5_67f4994d4809665e.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":693,\"alto\":443}','2026-10-28 14:42:15'),(18,1,'fotografias','agregar_fotografia','donacion_fotos',5,'{\"id_donacion\":5,\"nombre_archivo\":\"donacion_5_d2b40c605fd04d3d.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":1600,\"alto\":1167}','2026-10-28 14:42:16'),(19,1,'fotografias','agregar_fotografia','donacion_fotos',6,'{\"id_donacion\":5,\"nombre_archivo\":\"donacion_5_0d14cfd9854c30a1.webp\",\"tipo_original\":\"image/png\",\"ancho\":884,\"alto\":588}','2026-10-28 14:42:16'),(20,2,'autenticacion','iniciar_sesion','usuarios',2,'{}','2026-10-28 14:42:21'),(21,2,'autenticacion','iniciar_sesion','usuarios',2,'{}','2026-10-28 14:44:05'),(22,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 14:44:13'),(23,2,'autenticacion','iniciar_sesion','usuarios',2,'{}','2026-10-28 14:45:02'),(24,2,'solicitudes','crear','solicitudes',1,'{\"id_donacion\":5,\"cadena_frio_declarada\":true}','2026-10-28 14:45:06'),(25,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 14:45:10'),(26,1,'solicitudes','asignar','asignaciones',1,'{\"id_donacion\":5,\"id_solicitud\":1}','2026-10-28 14:45:13'),(27,1,'donaciones','iniciar_proceso','donaciones',5,'{\"id_solicitud\":1}','2026-10-28 14:45:13'),(28,1,'custodia','registrar_hito','seguimientos',7,'{\"id_entrega\":1,\"tipo\":\"aceptacion\",\"estado\":\"preparacion\",\"lugar\":\"Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno\",\"condicion_declarada\":\"sin_verificar\"}','2026-10-28 14:45:13'),(29,1,'custodia','iniciar','entregas',1,'{\"id_solicitud\":1}','2026-10-28 14:45:13'),(30,1,'solicitudes','aceptar','solicitudes',1,'{\"motivo\":null,\"id_donacion\":5}','2026-10-28 14:45:13'),(31,1,'logistica','calcular','evaluaciones_ruta',1,'{\"planificacion\":{\"preparacion_min\":10,\"recojo_min\":10,\"entrega_min\":5,\"margen_seguridad_min\":15,\"demora_trafico_min\":0,\"viaje_recojo_min\":2.1666666666666665,\"dispone_cadena_frio\":true},\"ruta_recojo\":{\"distancia_km\":0.787,\"duracion_estimada_min\":2.1666666666666665,\"proveedor\":\"OSRM / OpenStreetMap (servicio público académico)\",\"fecha_calculo\":\"2026-10-28T14:44:09.358Z\",\"origen\":{\"latitud\":-15.8377634,\"longitud\":-70.0280229},\"destino\":{\"latitud\":-15.840908,\"longitud\":-70.028958},\"trafico_en_vivo\":false}}','2026-10-28 14:45:14'),(32,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 15:15:51'),(33,1,'donaciones','crear','donaciones',6,'{\"alimento\":\"embutidos\"}','2026-10-28 15:45:28'),(34,1,'fotografias','agregar_fotografia','donacion_fotos',7,'{\"id_donacion\":6,\"nombre_archivo\":\"donacion_6_25622b0a87cec1d4.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":452,\"alto\":678}','2026-10-28 15:45:28'),(35,1,'fotografias','agregar_fotografia','donacion_fotos',8,'{\"id_donacion\":6,\"nombre_archivo\":\"donacion_6_84fbf010ba89d85c.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":452,\"alto\":678}','2026-10-28 15:45:28'),(36,1,'fotografias','agregar_fotografia','donacion_fotos',9,'{\"id_donacion\":6,\"nombre_archivo\":\"donacion_6_ad7445af0a08fca8.webp\",\"tipo_original\":\"image/jpeg\",\"ancho\":452,\"alto\":678}','2026-10-28 15:45:28'),(37,1,'autenticacion','cerrar_sesion','usuarios',1,'{}','2026-10-28 15:46:08'),(38,2,'autenticacion','iniciar_sesion','usuarios',2,'{}','2026-10-28 15:46:12'),(39,2,'solicitudes','crear','solicitudes',2,'{\"id_donacion\":6,\"cadena_frio_declarada\":true}','2026-10-28 15:50:11'),(40,2,'logistica','calcular','evaluaciones_ruta',2,'{\"planificacion\":{\"preparacion_min\":10,\"recojo_min\":10,\"entrega_min\":5,\"margen_seguridad_min\":15,\"demora_trafico_min\":0,\"viaje_recojo_min\":2.1666666666666665,\"dispone_cadena_frio\":true},\"ruta_recojo\":{\"distancia_km\":0.787,\"duracion_estimada_min\":2.1666666666666665,\"proveedor\":\"OSRM / OpenStreetMap (servicio público académico)\",\"fecha_calculo\":\"2026-10-28T15:51:51.275Z\",\"origen\":{\"latitud\":-15.8377634,\"longitud\":-70.0280229},\"destino\":{\"latitud\":-15.840908,\"longitud\":-70.028958},\"trafico_en_vivo\":false}}','2026-10-28 15:51:51'),(41,2,'logistica','calcular','evaluaciones_ruta',3,'{\"planificacion\":{\"preparacion_min\":10,\"recojo_min\":10,\"entrega_min\":5,\"margen_seguridad_min\":15,\"demora_trafico_min\":0,\"viaje_recojo_min\":2.1666666666666665,\"dispone_cadena_frio\":true},\"ruta_recojo\":{\"distancia_km\":0.787,\"duracion_estimada_min\":2.1666666666666665,\"proveedor\":\"OSRM / OpenStreetMap (servicio público académico)\",\"fecha_calculo\":\"2026-10-28T15:51:51.275Z\",\"origen\":{\"latitud\":-15.8377634,\"longitud\":-70.0280229},\"destino\":{\"latitud\":-15.840908,\"longitud\":-70.028958},\"trafico_en_vivo\":false}}','2026-10-28 15:53:12'),(42,2,'autenticacion','cerrar_sesion','usuarios',2,'{}','2026-10-28 15:53:18'),(43,2,'autenticacion','iniciar_sesion','usuarios',2,'{}','2026-10-28 15:57:49'),(44,2,'autenticacion','cerrar_sesion','usuarios',2,'{}','2026-10-28 16:03:35'),(45,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 16:03:37'),(46,1,'autenticacion','cerrar_sesion','usuarios',1,'{}','2026-10-28 16:04:19'),(47,3,'autenticacion','iniciar_sesion','usuarios',3,'{}','2026-10-28 16:32:25'),(48,3,'solicitudes','crear','solicitudes',3,'{\"id_donacion\":6,\"cadena_frio_declarada\":false}','2026-10-28 16:32:31'),(49,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 16:33:08'),(50,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 16:33:53'),(51,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 16:34:10'),(52,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 16:34:34'),(53,1,'autenticacion','editar_perfil','usuarios',1,'{\"ubicacion_actualizada\":true}','2026-10-28 16:34:37'),(54,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 16:41:55'),(55,4,'autenticacion','iniciar_sesion','usuarios',4,'{}','2026-10-28 16:42:49'),(56,1,'autenticacion','iniciar_sesion','usuarios',1,'{}','2026-10-28 16:43:08');
/*!40000 ALTER TABLE `auditoria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `donacion_fotos`
--

DROP TABLE IF EXISTS `donacion_fotos`;
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donacion_fotos`
--

LOCK TABLES `donacion_fotos` WRITE;
/*!40000 ALTER TABLE `donacion_fotos` DISABLE KEYS */;
INSERT INTO `donacion_fotos` VALUES (1,4,'frente_pan-artesanal-marca-original.jpeg','donacion_4_ecf34d77e3278085.webp','uploads/donaciones/donacion_4_ecf34d77e3278085.webp','image/webp',266110,1,'2026-10-28 14:13:48'),(2,4,'costado_quesos-artesanales.jpeg','donacion_4_cf75fee9865fb694.webp','uploads/donaciones/donacion_4_cf75fee9865fb694.webp','image/webp',38998,0,'2026-10-28 14:13:48'),(3,4,'cerca_trucha-plato-andino.jpeg','donacion_4_d904ddc8d52c3cba.webp','uploads/donaciones/donacion_4_d904ddc8d52c3cba.webp','image/webp',25196,0,'2026-10-28 14:13:48'),(4,5,'frente_quesos-artesanales.jpeg','donacion_5_67f4994d4809665e.webp','uploads/donaciones/donacion_5_67f4994d4809665e.webp','image/webp',38998,1,'2026-10-28 14:42:15'),(5,5,'costado_pan-artesanal-marca-original.jpeg','donacion_5_d2b40c605fd04d3d.webp','uploads/donaciones/donacion_5_d2b40c605fd04d3d.webp','image/webp',266110,0,'2026-10-28 14:42:16'),(6,5,'cerca_plato-tradicional-andino.png','donacion_5_0d14cfd9854c30a1.webp','uploads/donaciones/donacion_5_0d14cfd9854c30a1.webp','image/webp',100864,0,'2026-10-28 14:42:16'),(7,6,'frente_images (1).jpg','donacion_6_25622b0a87cec1d4.webp','uploads/donaciones/donacion_6_25622b0a87cec1d4.webp','image/webp',64178,1,'2026-10-28 15:45:28'),(8,6,'costado_images (1).jpg','donacion_6_84fbf010ba89d85c.webp','uploads/donaciones/donacion_6_84fbf010ba89d85c.webp','image/webp',64178,0,'2026-10-28 15:45:28'),(9,6,'cerca_images (1).jpg','donacion_6_ad7445af0a08fca8.webp','uploads/donaciones/donacion_6_ad7445af0a08fca8.webp','image/webp',64178,0,'2026-10-28 15:45:28');
/*!40000 ALTER TABLE `donacion_fotos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `donaciones`
--

DROP TABLE IF EXISTS `donaciones`;
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donaciones`
--

LOCK TABLES `donaciones` WRITE;
/*!40000 ALTER TABLE `donaciones` DISABLE KEYS */;
INSERT INTO `donaciones` VALUES (1,1,'Pan integral · demostración','Panadería','[DEMO:SEED:PAN] Pan declarado por un donante ficticio. Solo para demostrar el flujo del MVP.',30.00,'unidades','panaderia',NULL,NULL,'2026-10-28 08:37:26','2026-10-29 08:42:26','2026-10-29 11:42:26','Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno',-15.8409080,-70.0289581,'Temperatura ambiente',0,NULL,'Envase de demostración declarado',NULL,'Ubicación demostrativa de punto público, no establecimiento real.','Mantener protegido en un lugar limpio y seco, según declaración de prueba.','disponible','2026-10-28 13:42:26','2026-10-28 13:42:26'),(2,1,'Manzanas y plátanos · demostración','Frutas','[DEMO:SEED:FRUTAS] Fruta de demostración. No representa alimentos disponibles en un establecimiento real.',12.00,'kg','frutas',NULL,NULL,'2026-10-28 08:37:26','2026-10-29 20:42:26','2026-10-29 23:42:26','Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno',-15.8409080,-70.0289581,'Temperatura ambiente',0,NULL,'Envase de demostración declarado',NULL,'Ubicación demostrativa de punto público, no establecimiento real.','Declaración de demostración: proteger de golpes y contaminación.','disponible','2026-10-28 13:42:26','2026-10-28 13:42:26'),(3,1,'Yogur envasado · demostración','Lácteos','[DEMO:SEED:FRIO] Escenario de prueba con cadena de frío declarada. Sin certificación sanitaria.',18.00,'unidades','refrigerado',NULL,NULL,'2026-10-28 08:37:26','2026-10-28 20:42:26','2026-10-28 23:42:26','Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno',-15.8409080,-70.0289581,'Refrigerado',1,NULL,'Envase de demostración declarado',NULL,'Ubicación demostrativa de punto público, no establecimiento real.','Requiere medios de conservación refrigerada según declaración del donante; verificar condiciones antes de coordinar.','disponible','2026-10-28 13:42:26','2026-10-28 13:42:26'),(4,1,'Pan francés de prueba (3 fotos)','Panadería',NULL,20.00,'unidades','panaderia',NULL,NULL,'2026-10-28 09:13:00','2026-10-28 15:13:00',NULL,'Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno',-15.8409080,-70.0289580,'Temperatura ambiente',0,NULL,'Bolsas cerradas',NULL,'Ubicación demostrativa de punto público, no establecimiento real.',NULL,'disponible','2026-10-28 14:13:47','2026-10-28 14:13:47'),(5,1,'Queso fresco de prueba (comprobante)','Lácteos','Queso fresco elaborado hoy, en bloques de 1 kg.',8.00,'kg','refrigerado',NULL,NULL,'2026-10-28 09:42:00','2026-10-28 15:42:00',NULL,'Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno',-15.8409080,-70.0289580,'Refrigerado',1,NULL,'Bolsas selladas',NULL,'Ubicación demostrativa de punto público, no establecimiento real.',NULL,'en_proceso','2026-10-28 14:42:15','2026-10-28 14:45:13'),(6,1,'embutidos','Otros','estan frescos',20.00,'unidades','general',NULL,NULL,'2026-10-28 10:36:00','2026-10-29 16:36:00','2026-10-30 10:43:00','Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno',-15.8260720,-70.0172640,'Temperatura ambiente',0,'5','en bolsas',NULL,'Ubicación demostrativa de punto público, no establecimiento real.','no aplastarlo y mantenerlo refrigerado','disponible','2026-10-28 15:45:28','2026-10-28 15:45:28');
/*!40000 ALTER TABLE `donaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `donantes`
--

DROP TABLE IF EXISTS `donantes`;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donantes`
--

LOCK TABLES `donantes` WRITE;
/*!40000 ALTER TABLE `donantes` DISABLE KEYS */;
INSERT INTO `donantes` VALUES (1,1,'Panadería San Carlos · DEMO',NULL,NULL,'Donante de demostración','Punto público demostrativo: Catedral Basílica San Carlos Borromeo, Jirón Deustua, Puno · Ref.: Ubicación demostrativa de punto público, no establecimiento real.','Puno','Puno','Puno',-15.8409080,-70.0289580,'verificado','2026-10-28 13:42:26');
/*!40000 ALTER TABLE `donantes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `entregas`
--

DROP TABLE IF EXISTS `entregas`;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `entregas`
--

LOCK TABLES `entregas` WRITE;
/*!40000 ALTER TABLE `entregas` DISABLE KEYS */;
INSERT INTO `entregas` VALUES (1,5,1,'Panadería San Carlos · DEMO',NULL,NULL,NULL,NULL,NULL,NULL,'pendiente');
/*!40000 ALTER TABLE `entregas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `evaluaciones_ruta`
--

DROP TABLE IF EXISTS `evaluaciones_ruta`;
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evaluaciones_ruta`
--

LOCK TABLES `evaluaciones_ruta` WRITE;
/*!40000 ALTER TABLE `evaluaciones_ruta` DISABLE KEYS */;
INSERT INTO `evaluaciones_ruta` VALUES (1,5,1,1,-15.8409080,-70.0289580,-15.8377634,-70.0280229,1.26,3.00,10.00,10.00,5.00,NULL,NULL,NULL,'gris','OSRM / OpenStreetMap (servicio público académico)','2026-10-28 14:45:14'),(2,5,1,1,-15.8409080,-70.0289580,-15.8377634,-70.0280229,1.26,3.00,10.00,10.00,5.00,NULL,NULL,NULL,'gris','OSRM / OpenStreetMap (servicio público académico)','2026-10-28 15:51:51'),(3,5,1,1,-15.8409080,-70.0289580,-15.8377634,-70.0280229,1.26,3.00,10.00,10.00,5.00,NULL,NULL,NULL,'gris','OSRM / OpenStreetMap (servicio público académico)','2026-10-28 15:53:12');
/*!40000 ALTER TABLE `evaluaciones_ruta` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `incidencias`
--

DROP TABLE IF EXISTS `incidencias`;
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

--
-- Dumping data for table `incidencias`
--

LOCK TABLES `incidencias` WRITE;
/*!40000 ALTER TABLE `incidencias` DISABLE KEYS */;
/*!40000 ALTER TABLE `incidencias` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notificaciones`
--

DROP TABLE IF EXISTS `notificaciones`;
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

--
-- Dumping data for table `notificaciones`
--

LOCK TABLES `notificaciones` WRITE;
/*!40000 ALTER TABLE `notificaciones` DISABLE KEYS */;
/*!40000 ALTER TABLE `notificaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `organizaciones`
--

DROP TABLE IF EXISTS `organizaciones`;
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `organizaciones`
--

LOCK TABLES `organizaciones` WRITE;
/*!40000 ALTER TABLE `organizaciones` DISABLE KEYS */;
INSERT INTO `organizaciones` VALUES (1,2,'Comedor Esperanza · DEMO',NULL,'Responsable de demostración',0,'Punto público demostrativo: Parque Pino, Puno · Ref.: Ubicación demostrativa de punto público, no establecimiento real.','Puno','Puno','Puno',-15.8377634,-70.0280229,'verificado','2026-10-28 13:42:26'),(2,3,'Red Solidaria · DEMO',NULL,'Segundo responsable de demostración',0,'Punto público demostrativo: Parque Pino, Puno (segunda cuenta de prueba) · Ref.: Ubicación demostrativa de punto público, no establecimiento real.','Puno','Puno','Puno',-15.8377634,-70.0280229,'verificado','2026-10-28 13:42:26');
/*!40000 ALTER TABLE `organizaciones` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `seguimientos`
--

DROP TABLE IF EXISTS `seguimientos`;
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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seguimientos`
--

LOCK TABLES `seguimientos` WRITE;
/*!40000 ALTER TABLE `seguimientos` DISABLE KEYS */;
INSERT INTO `seguimientos` VALUES (1,1,1,'publicada','Panadería San Carlos · DEMO','Donación publicada por la semilla de demostración.','2026-10-28 13:42:26'),(2,2,1,'publicada','Panadería San Carlos · DEMO','Donación publicada por la semilla de demostración.','2026-10-28 13:42:26'),(3,3,1,'publicada','Panadería San Carlos · DEMO','Donación publicada por la semilla de demostración.','2026-10-28 13:42:26'),(4,4,1,'publicada','Panadería San Carlos · DEMO','Donación publicada por el donante.','2026-10-28 14:13:47'),(5,5,1,'publicada','Panadería San Carlos · DEMO','Donación publicada por el donante.','2026-10-28 14:42:15'),(6,5,2,'solicitud_recibida','Comedor Esperanza · DEMO','Solicitud #1 registrada por la organización.','2026-10-28 14:45:06'),(7,5,1,'solicitud_aceptada','Panadería San Carlos · DEMO','Solicitud aceptada. El alimento continúa bajo custodia del donante hasta registrar la transferencia.','2026-10-28 14:45:13'),(8,6,1,'publicada','Panadería San Carlos · DEMO','Donación publicada por el donante.','2026-10-28 15:45:28'),(9,6,2,'solicitud_recibida','Comedor Esperanza · DEMO','Solicitud #2 registrada por la organización.','2026-10-28 15:50:11'),(10,6,3,'solicitud_recibida','Red Solidaria · DEMO','Solicitud #3 registrada por la beneficiaria.','2026-10-28 16:32:31');
/*!40000 ALTER TABLE `seguimientos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `solicitudes`
--

DROP TABLE IF EXISTS `solicitudes`;
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `solicitudes`
--

LOCK TABLES `solicitudes` WRITE;
/*!40000 ALTER TABLE `solicitudes` DISABLE KEYS */;
INSERT INTO `solicitudes` VALUES (1,5,1,8.00,'Organización de demostración','000000000','2026-10-28 10:45:00','Mototaxi','Cooler con hielo','La organización declara medios para mantener la cadena de frío durante el traslado.',NULL,'aceptada','2026-10-28 14:45:06'),(2,6,1,20.00,'Organización de demostración','999999999','2026-10-28 11:46:00','auto toyota gris','bolsas cerradas','La organización declara medios para mantener la cadena de frío durante el traslado.','llegaremos en un auto color griz de la marca hilux','pendiente','2026-10-28 15:50:11'),(3,6,2,20.00,'Rosa Mamani Quispe','951234567','2026-10-28 12:32:00','Mototaxi','Cajas limpias con tapa',NULL,'Llegaremos en una mototaxi azul.','pendiente','2026-10-28 16:32:31');
/*!40000 ALTER TABLE `solicitudes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES (1,'Donante de demostración',NULL,'donante@realimenta.test','scrypt$16384$8$1$5b38cfbf6b09e683fab70d95ebd51747$83e63adc96a611991efc6832cfe943a7ab8c3320b7ebbb3032d01b0099f3decdb3564c84e169e1308bbaae2505c7547cff64595f01fb4f09c74808a055fddcf3','951000000','donante','activo','2026-10-28 13:42:26'),(2,'Beneficiaria de demostración',NULL,'organizacion@realimenta.test','scrypt$16384$8$1$5b38cfbf6b09e683fab70d95ebd51747$83e63adc96a611991efc6832cfe943a7ab8c3320b7ebbb3032d01b0099f3decdb3564c84e169e1308bbaae2505c7547cff64595f01fb4f09c74808a055fddcf3','951000000','organizacion','activo','2026-10-28 13:42:26'),(3,'Segunda beneficiaria de demostración',NULL,'organizacion2@realimenta.test','scrypt$16384$8$1$5b38cfbf6b09e683fab70d95ebd51747$83e63adc96a611991efc6832cfe943a7ab8c3320b7ebbb3032d01b0099f3decdb3564c84e169e1308bbaae2505c7547cff64595f01fb4f09c74808a055fddcf3','951000000','organizacion','activo','2026-10-28 13:42:26'),(4,'Administrador de demostración',NULL,'admin@realimenta.test','scrypt$16384$8$1$5b38cfbf6b09e683fab70d95ebd51747$83e63adc96a611991efc6832cfe943a7ab8c3320b7ebbb3032d01b0099f3decdb3564c84e169e1308bbaae2505c7547cff64595f01fb4f09c74808a055fddcf3','951000000','administrador','activo','2026-10-28 13:42:26');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'realimenta'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
