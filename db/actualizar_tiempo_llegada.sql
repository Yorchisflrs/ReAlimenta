-- Actualización de la base `realimenta` (30/10/2026): tiempo de llegada declarado por la beneficiaria.
-- La beneficiaria indica, al solicitar, cuántos minutos tardará en llegar al lugar de recojo; el donante lo ve.
-- Ejecutar UNA sola vez sobre una base ya creada (phpMyAdmin > realimenta > SQL, o
-- mysql -u root realimenta < db/actualizar_tiempo_llegada.sql). No borra ni modifica datos existentes.
-- La base creada con db/realimenta_completa.sql ya incluye esta columna.

ALTER TABLE `solicitudes`
  ADD COLUMN `tiempo_llegada_min` smallint(5) unsigned DEFAULT NULL;
