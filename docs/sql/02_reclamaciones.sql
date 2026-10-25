-- =====================================================================
-- HallazGO UD · Fase A · Script 02: reclamaciones
-- detalle_reservado, imagen, reclamacion, mensaje, entrega
-- Requiere haber ejecutado 01_tablas_base.sql antes.
-- =====================================================================

DROP TABLE IF EXISTS entrega           CASCADE;
DROP TABLE IF EXISTS mensaje           CASCADE;
DROP TABLE IF EXISTS reclamacion       CASCADE;
DROP TABLE IF EXISTS imagen            CASCADE;
DROP TABLE IF EXISTS detalle_reservado CASCADE;
DROP TYPE  IF EXISTS estado_reclamacion CASCADE;
DROP FUNCTION IF EXISTS fn_detalle_solo_encontrado() CASCADE;

CREATE TYPE estado_reclamacion AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'CANCELADA');

-- ---------------------------------------------------------------------
-- detalle_reservado: tabla 1:1 aparte (ajuste 5.2.1) para que un
-- SELECT * sobre publicacion nunca lo traiga por accidente.
-- La PK es a la vez FK: imposible tener dos detalles por publicación.
-- ---------------------------------------------------------------------
CREATE TABLE detalle_reservado (
    id_publicacion INT PRIMARY KEY REFERENCES publicacion(id) ON DELETE CASCADE,
    texto          TEXT NOT NULL CHECK (char_length(btrim(texto)) >= 3)
);

-- Un CHECK solo puede mirar columnas de su propia fila; para preguntar
-- "¿la publicación es ENCONTRADO?" hay que leer otra tabla, y eso
-- solo lo puede hacer un trigger.
CREATE FUNCTION fn_detalle_solo_encontrado() RETURNS trigger AS $$
BEGIN
    IF (SELECT tipo FROM publicacion WHERE id = NEW.id_publicacion) <> 'ENCONTRADO' THEN
        RAISE EXCEPTION 'El detalle reservado solo aplica a publicaciones ENCONTRADO (publicación %)', NEW.id_publicacion;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_detalle_solo_encontrado
    BEFORE INSERT OR UPDATE ON detalle_reservado
    FOR EACH ROW EXECUTE FUNCTION fn_detalle_solo_encontrado();

-- ---------------------------------------------------------------------
-- imagen: de 1 a 5 por publicación, con posición única.
-- (El "mínimo 1" no se puede exigir en la BD sin complicarla: lo valida el backend.)
-- ---------------------------------------------------------------------
CREATE TABLE imagen (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_publicacion INT  NOT NULL REFERENCES publicacion(id) ON DELETE CASCADE,
    url            TEXT NOT NULL,
    url_miniatura  TEXT NOT NULL,
    orden          SMALLINT NOT NULL CHECK (orden BETWEEN 1 AND 5),
    CONSTRAINT uq_imagen_publicacion_orden UNIQUE (id_publicacion, orden)
);
-- El UNIQUE de arriba empieza por id_publicacion, así que ya sirve de índice para la FK.

-- ---------------------------------------------------------------------
-- reclamacion
-- ---------------------------------------------------------------------
CREATE TABLE reclamacion (
    id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_publicacion    INT  NOT NULL REFERENCES publicacion(id),
    id_reclamante     INT  NOT NULL REFERENCES usuario(id),
    respuesta_detalle TEXT NOT NULL CHECK (char_length(btrim(respuesta_detalle)) >= 3),
    evidencia_url     TEXT,
    estado            estado_reclamacion NOT NULL DEFAULT 'PENDIENTE',
    fecha             TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_resolucion  TIMESTAMPTZ,
    -- Si está resuelta tiene fecha de resolución, y si está pendiente no.
    CONSTRAINT chk_reclamacion_resolucion
        CHECK ((estado = 'PENDIENTE') = (fecha_resolucion IS NULL)),
    CONSTRAINT chk_reclamacion_fechas
        CHECK (fecha_resolucion IS NULL OR fecha_resolucion >= fecha)
);

-- Índices únicos PARCIALES: la unicidad solo se exige a las filas del WHERE.
-- Solo una reclamación ACEPTADA por publicación:
CREATE UNIQUE INDEX uq_reclamacion_una_aceptada
    ON reclamacion (id_publicacion) WHERE estado = 'ACEPTADA';
-- Un usuario no puede tener dos PENDIENTE sobre la misma publicación:
CREATE UNIQUE INDEX uq_reclamacion_pendiente_por_usuario
    ON reclamacion (id_publicacion, id_reclamante) WHERE estado = 'PENDIENTE';

CREATE INDEX idx_reclamacion_id_publicacion ON reclamacion (id_publicacion);
CREATE INDEX idx_reclamacion_id_reclamante  ON reclamacion (id_reclamante);

-- ---------------------------------------------------------------------
-- mensaje: chat 1 a 1 colgado de una reclamación.
-- Quién puede escribir (solo las dos partes, solo si está ACEPTADA)
-- lo controla el servicio del backend (regla 6.4).
-- ---------------------------------------------------------------------
CREATE TABLE mensaje (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_reclamacion INT  NOT NULL REFERENCES reclamacion(id),
    id_emisor      INT  NOT NULL REFERENCES usuario(id),
    contenido      TEXT NOT NULL CHECK (char_length(btrim(contenido)) BETWEEN 1 AND 2000),
    leido          BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_envio    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sirve para la FK y para traer el hilo ya ordenado.
CREATE INDEX idx_mensaje_hilo      ON mensaje (id_reclamacion, fecha_envio);
CREATE INDEX idx_mensaje_id_emisor ON mensaje (id_emisor);

-- ---------------------------------------------------------------------
-- entrega: 1:1 con reclamacion (UNIQUE en la FK), doble confirmación.
-- ---------------------------------------------------------------------
CREATE TABLE entrega (
    id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_reclamacion      INT NOT NULL UNIQUE REFERENCES reclamacion(id),
    confirmo_autor      BOOLEAN NOT NULL DEFAULT FALSE,
    confirmo_reclamante BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_entrega       TIMESTAMPTZ,
    -- fecha_entrega existe si y solo si ambos confirmaron.
    CONSTRAINT chk_entrega_doble_confirmacion
        CHECK ((confirmo_autor AND confirmo_reclamante) = (fecha_entrega IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- Datos de prueba (usan los datos del script 01)
-- Publicación 1: ENCONTRADO de Ana (id 1). Luis (id 2) la reclama.
-- ---------------------------------------------------------------------
INSERT INTO detalle_reservado (id_publicacion, texto) VALUES
    (1, 'Tienen un sticker de un gato en el audífono derecho'),
    (3, 'El carné tiene una esquina doblada');

INSERT INTO imagen (id_publicacion, url, url_miniatura, orden) VALUES
    (1, 's3://hallazgo-imagenes/1/a.webp', 's3://hallazgo-imagenes/1/a_min.webp', 1),
    (1, 's3://hallazgo-imagenes/1/b.webp', 's3://hallazgo-imagenes/1/b_min.webp', 2);

INSERT INTO reclamacion (id_publicacion, id_reclamante, respuesta_detalle) VALUES
    (1, 2, 'Tienen un sticker de gato en un lado');

-- Ana acepta: reclamación ACEPTADA + fila de entrega vacía (regla 6.2).
UPDATE reclamacion SET estado = 'ACEPTADA', fecha_resolucion = now() WHERE id = 1;
UPDATE publicacion SET estado = 'EN_RECLAMACION' WHERE id = 1;
INSERT INTO entrega (id_reclamacion) VALUES (1);

INSERT INTO mensaje (id_reclamacion, id_emisor, contenido) VALUES
    (1, 1, 'Hola, ¿te sirve mañana a las 10 en la biblioteca?'),
    (1, 2, '¡Perfecto, allá nos vemos!');

-- Consulta de ejemplo: hilo del chat con nombres (solo id y nombre, nunca correo).
SELECT m.fecha_envio, u.nombre AS emisor, m.contenido
FROM mensaje m
JOIN usuario u ON u.id = m.id_emisor
WHERE m.id_reclamacion = 1
ORDER BY m.fecha_envio;
