CREATE TABLE recuperacion_contrasena (
 id_recuperacion integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_usuario integer NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
 hash_codigo char(64) NOT NULL UNIQUE,
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 fecha_expiracion timestamptz NOT NULL,
 fecha_uso timestamptz,
 fecha_invalidacion timestamptz,
 CHECK (fecha_expiracion > fecha_creacion),
 CHECK (hash_codigo ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX recuperacion_unica_pendiente ON recuperacion_contrasena(id_usuario)
 WHERE fecha_uso IS NULL AND fecha_invalidacion IS NULL;
CREATE INDEX recuperacion_usuario_fecha ON recuperacion_contrasena(id_usuario,fecha_expiracion DESC);
