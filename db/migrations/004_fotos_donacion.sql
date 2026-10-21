CREATE TABLE foto_donacion (
 id_foto integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_donacion integer NOT NULL REFERENCES donacion(id_donacion),
 id_usuario integer NOT NULL REFERENCES usuario(id_usuario),
 archivo varchar(80) NOT NULL UNIQUE CHECK (archivo ~ '^[a-f0-9]{40}\.webp$'),
 nombre_original varchar(160) NOT NULL,
 ancho integer NOT NULL CHECK (ancho>0),
 alto integer NOT NULL CHECK (alto>0),
 bytes integer NOT NULL CHECK (bytes>0),
 fecha_creacion timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX foto_por_donacion ON foto_donacion(id_donacion,id_foto);
