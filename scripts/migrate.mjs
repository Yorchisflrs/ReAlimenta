// La base MySQL "realimenta" y sus 13 tablas ya existen (creadas en phpMyAdmin) y se usan tal como están.
// Este proyecto no crea, altera ni elimina tablas; las migraciones de db/migrations corresponden a la
// versión anterior con PostgreSQL y se conservan solo como historial.
console.log('No se ejecutan migraciones: la estructura MySQL existente no se modifica.');
console.log('Comprobando conexión y estructura (solo lectura)...');
await import('./db-check.mjs');
