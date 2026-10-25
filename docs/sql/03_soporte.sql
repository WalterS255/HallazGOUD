-- =====================================================================
-- HallazGO UD · Fase A · Script 03: soporte
-- token_usuario, historial_estado, notificacion, reporte, auditoria
-- Requiere haber ejecutado 01_tablas_base.sql y 02_reclamaciones.sql.
-- =====================================================================

DROP TABLE IF EXISTS auditoria        CASCADE;
DROP TABLE IF EXISTS reporte          CASCADE;
DROP TABLE IF EXISTS notificacion     CASCADE;
DROP TABLE IF EXISTS historial_estado CASCADE;
DROP TABLE IF EXISTS token_usuario    CASCADE;
DROP TYPE  IF EXISTS tipo_token, tipo_notificacion, estado_reporte CASCADE;
DROP FUNCTION IF EXISTS fn_auditoria_inmutable() CASCADE;

CREATE TYPE tipo_token        AS ENUM ('VERIFICACION', 'RECUPERACION');
CREATE TYPE tipo_notificacion AS ENUM ('COINCIDENCIA', 'RECLAMACION', 'MENSAJE', 'ESTADO', 'MODERACION');
CREATE TYPE estado_reporte    AS ENUM ('PENDIENTE', 'RESUELTO', 'DESCARTADO');

-- ---------------------------------------------------------------------
-- token_usuario: enlaces de verificación y recuperación (regla 6.7).
-- Se guarda el HASH del token (SHA-256 en hex = 64 caracteres), nunca el
-- token en claro: si alguien roba la BD, no puede usar los enlaces.
-- ---------------------------------------------------------------------
CREATE TABLE token_usuario (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario INT         NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    tipo       tipo_token  NOT NULL,
    token_hash CHAR(64)    NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en  TIMESTAMPTZ NOT NULL,
    usado_en   TIMESTAMPTZ,  -- NULL = todavía no se ha usado (un solo uso)
    CONSTRAINT chk_token_expira CHECK (expira_en > creado_en),
    CONSTRAINT chk_token_usado  CHECK (usado_en IS NULL OR usado_en >= creado_en)
);
CREATE INDEX idx_token_usuario_id_usuario ON token_usuario (id_usuario, tipo);

-- ---------------------------------------------------------------------
-- historial_estado: cada cambio de estado de una publicación (ajuste 5.2.5).
-- estado_anterior es NULL solo en el primer registro (la creación).
-- ---------------------------------------------------------------------
CREATE TABLE historial_estado (
    id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_publicacion  INT                NOT NULL REFERENCES publicacion(id),
    estado_anterior estado_publicacion,
    estado_nuevo    estado_publicacion NOT NULL,
    id_usuario      INT REFERENCES usuario(id),  -- NULL si lo hizo el sistema (cron de expiración)
    motivo          VARCHAR(300),
    fecha           TIMESTAMPTZ        NOT NULL DEFAULT now(),
    CONSTRAINT chk_historial_cambio_real
        CHECK (estado_anterior IS DISTINCT FROM estado_nuevo)
);
CREATE INDEX idx_historial_publicacion ON historial_estado (id_publicacion, fecha);
CREATE INDEX idx_historial_id_usuario  ON historial_estado (id_usuario);

-- ---------------------------------------------------------------------
-- notificacion: avisos dentro de la app.
-- id_referencia apunta a "lo que pasó" (publicación, reclamación…) según el tipo;
-- no es FK porque puede apuntar a tablas distintas.
-- ---------------------------------------------------------------------
CREATE TABLE notificacion (
    id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario    INT               NOT NULL REFERENCES usuario(id),
    tipo          tipo_notificacion NOT NULL,
    mensaje       VARCHAR(300)      NOT NULL CHECK (char_length(btrim(mensaje)) > 0),
    id_referencia INT,
    leida         BOOLEAN           NOT NULL DEFAULT FALSE,
    fecha         TIMESTAMPTZ       NOT NULL DEFAULT now()
);
-- "Mis notificaciones sin leer, las más nuevas primero".
CREATE INDEX idx_notificacion_usuario ON notificacion (id_usuario, leida, fecha DESC);

-- ---------------------------------------------------------------------
-- reporte: denuncias de contenido para moderación (RF-26, RF-27).
-- ---------------------------------------------------------------------
CREATE TABLE reporte (
    id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_publicacion   INT            NOT NULL REFERENCES publicacion(id),
    id_reportante    INT            NOT NULL REFERENCES usuario(id),
    motivo           VARCHAR(500)   NOT NULL CHECK (char_length(btrim(motivo)) >= 5),
    estado           estado_reporte NOT NULL DEFAULT 'PENDIENTE',
    id_moderador     INT REFERENCES usuario(id),
    fecha            TIMESTAMPTZ    NOT NULL DEFAULT now(),
    fecha_resolucion TIMESTAMPTZ,
    -- Pendiente: sin moderador ni fecha. Resuelto/descartado: con ambos.
    CONSTRAINT chk_reporte_resolucion
        CHECK ((estado = 'PENDIENTE') = (id_moderador IS NULL AND fecha_resolucion IS NULL)
           AND (id_moderador IS NULL) = (fecha_resolucion IS NULL)),
    CONSTRAINT chk_reporte_fechas
        CHECK (fecha_resolucion IS NULL OR fecha_resolucion >= fecha)
);
-- Un usuario no puede reportar dos veces la misma publicación mientras siga pendiente.
CREATE UNIQUE INDEX uq_reporte_pendiente_por_usuario
    ON reporte (id_publicacion, id_reportante) WHERE estado = 'PENDIENTE';
-- La bandeja del moderador: pendientes, los más viejos primero (plazo de 48 h).
CREATE INDEX idx_reporte_bandeja        ON reporte (estado, fecha);
CREATE INDEX idx_reporte_id_publicacion ON reporte (id_publicacion);
CREATE INDEX idx_reporte_id_reportante  ON reporte (id_reportante);
CREATE INDEX idx_reporte_id_moderador   ON reporte (id_moderador);

-- ---------------------------------------------------------------------
-- auditoria: registro de acciones críticas (RNF-18). INMUTABLE.
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- BIGINT: es la tabla que más crece
    id_usuario INT REFERENCES usuario(id),  -- NULL = acción del sistema o de un visitante
    accion     VARCHAR(60)  NOT NULL,       -- p. ej. 'LOGIN_FALLIDO', 'RECLAMACION_ACEPTADA'
    entidad    VARCHAR(60)  NOT NULL,       -- p. ej. 'publicacion', 'usuario'
    id_entidad INT,
    detalle    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    ip         INET,                        -- tipo propio de Postgres: rechaza IPs mal escritas
    fecha      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_entidad    ON auditoria (entidad, id_entidad);
CREATE INDEX idx_auditoria_id_usuario ON auditoria (id_usuario, fecha);
CREATE INDEX idx_auditoria_fecha      ON auditoria (fecha);

-- No hay un CHECK que diga "esta fila no se puede cambiar": los CHECK revisan
-- valores, no operaciones. Por eso un trigger cancela todo UPDATE y DELETE.
CREATE FUNCTION fn_auditoria_inmutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La tabla auditoria es inmutable: no se permite % ', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_inmutable
    BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_inmutable();

-- TRUNCATE (vaciar la tabla de golpe) no pasa por los triggers de fila,
-- así que necesita su propio trigger "por sentencia".
CREATE TRIGGER trg_auditoria_sin_truncate
    BEFORE TRUNCATE ON auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION fn_auditoria_inmutable();

-- ---------------------------------------------------------------------
-- Datos de prueba (continúan la historia del script 02)
-- ---------------------------------------------------------------------
INSERT INTO token_usuario (id_usuario, tipo, token_hash, expira_en) VALUES
    (1, 'VERIFICACION', encode(sha256('token-de-prueba-ana'::bytea), 'hex'), now() + interval '24 hours');

INSERT INTO historial_estado (id_publicacion, estado_anterior, estado_nuevo, id_usuario, motivo) VALUES
    (1, NULL,     'ACTIVA',         1, 'Publicación creada'),
    (1, 'ACTIVA', 'EN_RECLAMACION', 1, 'Reclamación 1 aceptada');

INSERT INTO notificacion (id_usuario, tipo, mensaje, id_referencia) VALUES
    (1, 'RECLAMACION', 'Alguien reclamó tus audífonos', 1),
    (2, 'ESTADO',      'Tu reclamación fue aceptada; ya puedes conversar', 1),
    (2, 'COINCIDENCIA','Hay un objeto encontrado parecido a lo que perdiste', 1);

INSERT INTO reporte (id_publicacion, id_reportante, motivo) VALUES
    (3, 1, 'La foto muestra el número del documento');

INSERT INTO auditoria (id_usuario, accion, entidad, id_entidad, detalle, ip) VALUES
    (1, 'RECLAMACION_ACEPTADA', 'reclamacion', 1, '{"id_publicacion": 1}', '190.24.10.5'),
    (NULL, 'LOGIN_FALLIDO', 'usuario', NULL, '{"motivo": "contrasena"}', '181.50.3.77');

-- Consulta de ejemplo: línea de tiempo de la publicación 1.
SELECT h.fecha, h.estado_anterior, h.estado_nuevo, u.nombre AS quien, h.motivo
FROM historial_estado h
LEFT JOIN usuario u ON u.id = h.id_usuario
WHERE h.id_publicacion = 1
ORDER BY h.fecha, h.id;
