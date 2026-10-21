# PostgreSQL local de REAlimenta

Configuración comprobada el 21 de octubre de 2026. Esta instalación ejecuta un servidor PostgreSQL real y guarda los datos en disco; no utiliza una base simulada ni almacenamiento del navegador.

## Configuración instalada

| Elemento | Valor comprobado |
| --- | --- |
| Motor | PostgreSQL 17.10, Windows x64 |
| Dirección de escucha | `127.0.0.1` |
| Puerto | `55432` |
| Base de datos | `realimenta` |
| Usuario local | `realimenta` |
| Autenticación | `scram-sha-256` |
| Datos persistentes | `.local/pgdata/` |
| Binarios | `.local/postgres/package/native/bin/` |
| Registro del servidor | `.local/postgres.log` |
| Conexión del backend | Variable `DATABASE_URL` en `.env` |

El servidor se inicia como un proceso del usuario de Windows. No se instala un servicio global, no se cambia el `PATH` y no se modifican otras instalaciones o bases de datos.

## Origen e integridad de los binarios

El runtime procede del paquete fijado `@embedded-postgres/windows-x64@17.10.0-beta.17`, descargado del registro npm. La etiqueta `beta.17` pertenece a la versión del paquete distribuidor; el ejecutable y el servidor consultado identifican el motor como PostgreSQL 17.10.

- Paquete: <https://www.npmjs.com/package/@embedded-postgres/windows-x64/v/17.10.0-beta.17>
- Archivo: <https://registry.npmjs.org/@embedded-postgres/windows-x64/-/windows-x64-17.10.0-beta.17.tgz>
- Integridad fijada: `sha512-q6xIETTkv67i1QlTWz1LAKb3Z+vG2V3qrp+BjLEWhCQ9jE4hbbsQ/J/3wiOPFLJbuwak7CfHC9EUJG7txAbGKw==`

`start-db.ps1` comprueba el SHA512 antes de extraer el archivo. La procedencia también queda registrada en `.local/postgres/source.json`. El paquete portable no necesita instalarse globalmente mediante npm.

Se intentó inicialmente obtener el ZIP oficial de EDB, pero las descargas completas y por rangos agotaron el tiempo de espera. Se utilizó este runtime portable alternativo para conservar PostgreSQL real y permitir una instalación local reproducible.

## Requisitos

Windows x64, PowerShell, Node.js 24 o posterior y npm en el `PATH`. El script usa `curl.exe` y `tar.exe`, disponibles y comprobados en este equipo. Se necesita acceso al registro npm para descargar dependencias y, en una instalación nueva, el runtime portable.

El driver `pg` debe estar instalado entre las dependencias del proyecto. El runtime reducido contiene `postgres.exe`, `initdb.exe` y `pg_ctl.exe`; la creación y comprobación de la base se realizan con el driver de Node.js, sin requerir `psql` o `createdb` globales.

## Primer arranque

Desde la raíz del proyecto:

```powershell
npm install
npm run db:start
npm run db:migrate
npm run db:seed
npm start
```

En una instalación nueva, `db:start` descarga y verifica el runtime, inicializa `.local/pgdata`, genera una contraseña aleatoria, guarda `DATABASE_URL` en `.env`, inicia el servidor y crea la base `realimenta` si todavía no existe.

Si `.env` ya existe, el script conserva sus demás variables. Si ya contiene una conexión local válida, la reutiliza. No sustituya la conexión generada por el valor ilustrativo `CAMBIAR_CONTRASENA` de `.env.example`: ese archivo es una guía, no contiene la credencial real. Para añadir las demás opciones del ejemplo, conserve siempre la línea `DATABASE_URL` de su instalación.

La contraseña de la base no aparece en la consola ni en esta documentación. `.env` y `.local/` están excluidos mediante `.gitignore`.

## Arranque y parada posteriores

```powershell
npm run db:start
npm run db:stop
```

La parada afecta únicamente al directorio de datos de este proyecto y conserva los registros. Volver a iniciar utiliza los mismos datos y la misma conexión. Si el puerto está ocupado por otro proceso, el script informa el conflicto y no detiene ese proceso.

Si ya existe `.local/pgdata` y falta `DATABASE_URL`, el script se detiene para evitar reinicializar datos o inventar otra contraseña. Debe restaurarse el `.env` correspondiente a esa instalación.

## Comprobaciones ejecutadas

Se verificaron directamente el ejecutable `postgres --version` y una conexión SQL contra PostgreSQL, obteniendo: versión `17.10`, base `realimenta`, usuario `realimenta`, escucha `127.0.0.1` y puerto `55432`.

También se ejecutó la siguiente secuencia: parar, volver a parar, iniciar y volver a iniciar. Las cuatro operaciones terminaron con código cero. La segunda parada informó que el servidor ya estaba detenido; el segundo arranque reutilizó el proceso existente. La conexión real a la base siguió funcionando y `.env` permaneció idéntico byte a byte.

Las migraciones, las semillas y las pruebas funcionales de los módulos tienen sus propios comandos y evidencias; la comprobación de arranque descrita aquí no sustituye esas pruebas.

## Alcance de desarrollo

El usuario `realimenta` es el administrador del clúster local creado por `initdb`. Esto permite inicializar la base y crear bases aisladas para pruebas en este equipo. Esta configuración corresponde a la demostración académica local. Un despliegue compartido debe separar el usuario administrador de un usuario de aplicación con los permisos necesarios.

La aplicación configura las conexiones PostgreSQL con la zona horaria `America/Lima`; las columnas de fechas operativas usan `timestamptz`.
