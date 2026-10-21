CREATE TABLE usuario (
 id_usuario integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 nombre varchar(160) NOT NULL,
 correo varchar(254) NOT NULL,
 hash_contrasena text NOT NULL,
 telefono varchar(40) NOT NULL DEFAULT '',
 rol text NOT NULL CHECK (rol IN ('donante','organizacion','administrador')),
 estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
 es_demostracion boolean NOT NULL DEFAULT false,
 fecha_creacion timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_correo_unique ON usuario (lower(correo));

CREATE TABLE donante (
 id_donante integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_usuario integer NOT NULL UNIQUE REFERENCES usuario(id_usuario),
 nombre_establecimiento varchar(180) NOT NULL,
 departamento varchar(100) NOT NULL DEFAULT 'Puno',
 provincia varchar(100) NOT NULL DEFAULT 'Puno',
 distrito varchar(100) NOT NULL,
 direccion varchar(300) NOT NULL,
 referencia varchar(300) NOT NULL DEFAULT '',
 latitud double precision NOT NULL CHECK (latitud BETWEEN -90 AND 90),
 longitud double precision NOT NULL CHECK (longitud BETWEEN -180 AND 180),
 ubicacion_confirmada boolean NOT NULL DEFAULT false,
 estado_verificacion text NOT NULL DEFAULT 'pendiente' CHECK (estado_verificacion IN ('pendiente','verificado','rechazado'))
);
CREATE TABLE organizacion (
 id_organizacion integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_usuario integer NOT NULL UNIQUE REFERENCES usuario(id_usuario),
 nombre varchar(180) NOT NULL,
 responsable varchar(160) NOT NULL,
 departamento varchar(100) NOT NULL DEFAULT 'Puno',
 provincia varchar(100) NOT NULL DEFAULT 'Puno',
 distrito varchar(100) NOT NULL,
 direccion varchar(300) NOT NULL,
 referencia varchar(300) NOT NULL DEFAULT '',
 latitud double precision NOT NULL CHECK (latitud BETWEEN -90 AND 90),
 longitud double precision NOT NULL CHECK (longitud BETWEEN -180 AND 180),
 ubicacion_confirmada boolean NOT NULL DEFAULT false,
 estado_verificacion text NOT NULL DEFAULT 'pendiente' CHECK (estado_verificacion IN ('pendiente','verificado','rechazado'))
);
CREATE TABLE sesion (
 hash_token char(64) PRIMARY KEY,
 id_usuario integer NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
 csrf_token varchar(64) NOT NULL,
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 fecha_expiracion timestamptz NOT NULL
);
CREATE INDEX sesion_expiracion ON sesion(fecha_expiracion);

CREATE TABLE donacion (
 id_donacion integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_donante integer NOT NULL REFERENCES donante(id_donante),
 alimento varchar(180) NOT NULL,
 categoria varchar(100) NOT NULL,
 cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
 unidad varchar(40) NOT NULL,
 descripcion varchar(2500) NOT NULL DEFAULT '',
 fecha_disponibilidad timestamptz NOT NULL,
 fecha_limite_recojo timestamptz NOT NULL,
 fecha_limite_aprovechamiento_declarada timestamptz,
 direccion_recojo varchar(300) NOT NULL,
 distrito varchar(100) NOT NULL,
 latitud_recojo double precision NOT NULL CHECK (latitud_recojo BETWEEN -90 AND 90),
 longitud_recojo double precision NOT NULL CHECK (longitud_recojo BETWEEN -180 AND 180),
 conservacion_declarada varchar(1000) NOT NULL,
 requiere_cadena_frio boolean NOT NULL DEFAULT false,
 temperatura_declarada varchar(100) NOT NULL DEFAULT '',
 envase varchar(300) NOT NULL,
 observaciones varchar(2500) NOT NULL DEFAULT '',
 estado text NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible','en_proceso','cancelada','vencida')),
 motivo_cancelacion varchar(1000),
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
 CHECK (fecha_limite_recojo > fecha_disponibilidad),
 CHECK (fecha_limite_aprovechamiento_declarada IS NULL OR fecha_limite_aprovechamiento_declarada >= fecha_limite_recojo)
);
CREATE INDEX donacion_catalogo ON donacion(estado,fecha_limite_recojo);
CREATE INDEX donacion_propietario ON donacion(id_donante,fecha_creacion DESC);
CREATE INDEX donacion_categoria ON donacion(categoria);

CREATE TABLE solicitud (
 id_solicitud integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_donacion integer NOT NULL REFERENCES donacion(id_donacion),
 id_organizacion integer NOT NULL REFERENCES organizacion(id_organizacion),
 responsable_recojo varchar(160) NOT NULL,
 telefono varchar(40) NOT NULL,
 transporte_declarado varchar(300) NOT NULL,
 recipiente_declarado varchar(300) NOT NULL,
 dispone_cadena_frio boolean NOT NULL DEFAULT false,
 fecha_propuesta timestamptz NOT NULL,
 estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptada','rechazada','cancelada')),
 observaciones varchar(2500) NOT NULL DEFAULT '',
 motivo_decision varchar(1000),
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX solicitud_unica_aceptada ON solicitud(id_donacion) WHERE estado='aceptada';
CREATE UNIQUE INDEX solicitud_unica_activa_por_organizacion ON solicitud(id_donacion,id_organizacion) WHERE estado IN ('pendiente','aceptada');
CREATE INDEX solicitud_org ON solicitud(id_organizacion,fecha_creacion DESC);
CREATE INDEX solicitud_donacion ON solicitud(id_donacion,estado);

CREATE TABLE evaluacion_ruta (
 id_evaluacion integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_donacion integer NOT NULL REFERENCES donacion(id_donacion),
 id_solicitud integer REFERENCES solicitud(id_solicitud),
 id_organizacion integer REFERENCES organizacion(id_organizacion),
 id_usuario integer REFERENCES usuario(id_usuario),
 origen_latitud double precision NOT NULL,
 origen_longitud double precision NOT NULL,
 destino_latitud double precision NOT NULL,
 destino_longitud double precision NOT NULL,
 distancia_km double precision,
 duracion_estimada_min double precision,
 tiempo_total_estimado_min double precision,
 margen_tiempo_min double precision,
 estado_viabilidad varchar(40) NOT NULL,
 proveedor_ruta varchar(100) NOT NULL,
 geometria jsonb,
 detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
 fecha_calculo timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluacion_por_donacion ON evaluacion_ruta(id_donacion,fecha_calculo DESC);
CREATE TABLE auditoria (
 id_evento bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_usuario integer REFERENCES usuario(id_usuario),
 entidad varchar(60) NOT NULL,
 id_entidad integer,
 accion varchar(100) NOT NULL,
 fecha_evento timestamptz NOT NULL DEFAULT now(),
 detalle jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX auditoria_entidad ON auditoria(entidad,id_entidad,fecha_evento DESC);
CREATE INDEX auditoria_usuario ON auditoria(id_usuario,fecha_evento DESC);
