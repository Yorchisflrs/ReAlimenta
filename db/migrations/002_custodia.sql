ALTER TABLE donacion ADD COLUMN imagen_clave varchar(40) NOT NULL DEFAULT '';
ALTER TABLE donacion ADD COLUMN perfil_alimento varchar(60) NOT NULL DEFAULT 'general';
ALTER TABLE donacion ADD COLUMN ocultar_presentacion boolean NOT NULL DEFAULT false;

CREATE TABLE seguimiento (
 id_seguimiento integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_solicitud integer NOT NULL UNIQUE REFERENCES solicitud(id_solicitud),
 estado text NOT NULL DEFAULT 'preparacion' CHECK (estado IN ('preparacion','listo','recogido','en_transito','entregado','confirmado')),
 custodio_actual varchar(160) NOT NULL,
 origen jsonb NOT NULL,
 destino jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1,
 fecha_inicio timestamptz NOT NULL DEFAULT now(),
 fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hito_custodia (
 id_hito bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_seguimiento integer NOT NULL REFERENCES seguimiento(id_seguimiento),
 id_usuario integer NOT NULL REFERENCES usuario(id_usuario),
 tipo text NOT NULL CHECK (tipo IN ('aceptacion','listo','recogido','en_transito','entregado','confirmado','observacion')),
 estado_resultante text NOT NULL,
 responsable_entrega varchar(160) NOT NULL DEFAULT '',
 responsable_recibe varchar(160) NOT NULL DEFAULT '',
 lugar varchar(300) NOT NULL,
 condicion_declarada text NOT NULL DEFAULT 'sin_verificar' CHECK (condicion_declarada IN ('sin_verificar','sin_novedad','requiere_revision','no_conforme')),
 temperatura_c numeric(5,2) CHECK (temperatura_c BETWEEN -80 AND 120),
 conserva_frio boolean,
 observacion varchar(2500) NOT NULL,
 fecha_evento timestamptz NOT NULL DEFAULT now(),
 es_demostracion boolean NOT NULL DEFAULT false
);
CREATE INDEX hito_seguimiento ON hito_custodia(id_seguimiento,fecha_evento,id_hito);
CREATE TABLE incidencia (
 id_incidencia integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_seguimiento integer NOT NULL REFERENCES seguimiento(id_seguimiento),
 id_usuario integer NOT NULL REFERENCES usuario(id_usuario),
 tipo text NOT NULL CHECK (tipo IN ('demora','temperatura','envase','calidad','otro')),
 severidad text NOT NULL CHECK (severidad IN ('baja','media','alta')),
 titulo varchar(180) NOT NULL,
 descripcion varchar(2500) NOT NULL,
 estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','resuelta')),
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 resolucion varchar(2500),
 id_usuario_resuelve integer REFERENCES usuario(id_usuario),
 fecha_resolucion timestamptz,
 CHECK ((estado='abierta' AND fecha_resolucion IS NULL) OR (estado='resuelta' AND fecha_resolucion IS NOT NULL AND resolucion IS NOT NULL))
);
CREATE INDEX incidencia_seguimiento ON incidencia(id_seguimiento,estado);

-- La migración mantiene los acuerdos anteriores; las direcciones se conservan como instantáneas.
INSERT INTO seguimiento(id_solicitud,custodio_actual,origen,destino)
SELECT s.id_solicitud,dt.nombre_establecimiento,
 jsonb_build_object('nombre',dt.nombre_establecimiento,'direccion',d.direccion_recojo,'distrito',d.distrito,'latitud',d.latitud_recojo,'longitud',d.longitud_recojo),
 jsonb_build_object('nombre',o.nombre,'direccion',o.direccion,'distrito',o.distrito,'latitud',o.latitud,'longitud',o.longitud)
FROM solicitud s JOIN donacion d USING(id_donacion) JOIN donante dt USING(id_donante) JOIN organizacion o USING(id_organizacion)
WHERE s.estado='aceptada' AND d.estado='en_proceso';
INSERT INTO hito_custodia(id_seguimiento,id_usuario,tipo,estado_resultante,lugar,observacion,es_demostracion)
SELECT t.id_seguimiento,dt.id_usuario,'aceptacion','preparacion',d.direccion_recojo,
 'Solicitud aceptada antes de habilitar el seguimiento. Inicio de trazabilidad registrado al migrar, sin inventar hitos físicos anteriores.',u.es_demostracion
FROM seguimiento t JOIN solicitud s USING(id_solicitud) JOIN donacion d USING(id_donacion) JOIN donante dt USING(id_donante) JOIN usuario u ON u.id_usuario=dt.id_usuario;

CREATE FUNCTION proteger_hito_custodia() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Los hitos de custodia son inmutables; registre una observación correctiva.';
END;
$$;
CREATE TRIGGER hito_inmutable BEFORE UPDATE OR DELETE ON hito_custodia FOR EACH ROW EXECUTE FUNCTION proteger_hito_custodia();
