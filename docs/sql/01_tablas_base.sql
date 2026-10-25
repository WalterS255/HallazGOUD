-- =====================================================================
-- HallazGO UD · Fase A · Script 01: tablas base
-- usuario, categoria, sede, lugar, publicacion
-- Probado en PostgreSQL 16. Se puede ejecutar varias veces (borra y crea).
-- =====================================================================

-- Borrar en orden inverso a las dependencias (para poder re-ejecutar).
DROP TABLE IF EXISTS publicacion CASCADE;
DROP TABLE IF EXISTS lugar       CASCADE;
DROP TABLE IF EXISTS sede        CASCADE;
DROP TABLE IF EXISTS categoria   CASCADE;
DROP TABLE IF EXISTS usuario     CASCADE;
DROP TYPE  IF EXISTS rol_usuario, estado_cuenta, tipo_publicacion, estado_publicacion CASCADE;

-- ---------------------------------------------------------------------
-- ENUMs: listas cerradas de valores. Postgres rechaza cualquier otro.
-- ---------------------------------------------------------------------
CREATE TYPE rol_usuario        AS ENUM ('USUARIO', 'MODERADOR', 'ADMIN');
CREATE TYPE estado_cuenta      AS ENUM ('ACTIVA', 'SUSPENDIDA', 'ELIMINADA');
CREATE TYPE tipo_publicacion   AS ENUM ('PERDIDO', 'ENCONTRADO');
CREATE TYPE estado_publicacion AS ENUM ('ACTIVA', 'EN_RECLAMACION', 'ENTREGADA', 'EXPIRADA', 'RETIRADA');

-- ---------------------------------------------------------------------
-- Acceso
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
    id                   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre               VARCHAR(120),
    correo               VARCHAR(160),  -- único sin distinguir mayúsculas: ver uq_usuario_correo abajo
    hash_contrasena      VARCHAR(100),
    programa             VARCHAR(160),
    foto_url             TEXT,
    rol                  rol_usuario   NOT NULL DEFAULT 'USUARIO',
    verificado           BOOLEAN       NOT NULL DEFAULT FALSE,
    estado_cuenta        estado_cuenta NOT NULL DEFAULT 'ACTIVA',
    notificar_por_correo BOOLEAN       NOT NULL DEFAULT TRUE,
    intentos_fallidos    INT           NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
    bloqueado_hasta      TIMESTAMPTZ,
    acepto_politica_en   TIMESTAMPTZ   NOT NULL,
    fecha_registro       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    -- Solo correos institucionales. Al anonimizar (Ley 1581) el correo queda NULL.
    CONSTRAINT chk_usuario_correo_dominio
        CHECK (correo IS NULL OR correo ~* '^[^@\s]+@udistrital\.edu\.co$'),
    -- Una cuenta viva necesita nombre, correo y contraseña; una ELIMINADA no.
    CONSTRAINT chk_usuario_datos_si_activa
        CHECK (estado_cuenta = 'ELIMINADA'
               OR (nombre IS NOT NULL AND correo IS NOT NULL AND hash_contrasena IS NOT NULL))
);
-- Un UNIQUE normal compara letra por letra: 'Ana@…' y 'ana@…' serían correos distintos.
-- Este índice compara en minúsculas. Los NULL (cuentas anonimizadas) no chocan entre sí.
-- También sirve para buscar en el login: WHERE lower(correo) = lower($1).
CREATE UNIQUE INDEX uq_usuario_correo ON usuario (lower(correo));

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
CREATE TABLE categoria (
    id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre   VARCHAR(60) NOT NULL UNIQUE,
    icono    VARCHAR(60),
    sensible BOOLEAN NOT NULL DEFAULT FALSE,  -- documentos, tarjetas, llaves (regla 6.6)
    activa   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE sede (
    id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE lugar (
    id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_sede    INT NOT NULL REFERENCES sede(id),
    edificio   VARCHAR(100) NOT NULL,
    referencia VARCHAR(200),
    CONSTRAINT uq_lugar_sede_edificio UNIQUE (id_sede, edificio)
);
CREATE INDEX idx_lugar_id_sede ON lugar(id_sede);

-- ---------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------
CREATE TABLE publicacion (
    id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario        INT NOT NULL REFERENCES usuario(id),
    id_categoria      INT NOT NULL REFERENCES categoria(id),
    id_lugar          INT NOT NULL REFERENCES lugar(id),
    tipo              tipo_publicacion   NOT NULL,
    titulo            VARCHAR(100)       NOT NULL,
    descripcion       TEXT               NOT NULL,
    fecha_suceso      TIMESTAMPTZ        NOT NULL,  -- fecha + hora unidas (ajuste 5.2.2)
    estado            estado_publicacion NOT NULL DEFAULT 'ACTIVA',
    oculta            BOOLEAN            NOT NULL DEFAULT FALSE,
    fecha_creacion    TIMESTAMPTZ        NOT NULL DEFAULT now(),
    ultima_actividad  TIMESTAMPTZ        NOT NULL DEFAULT now(),
    -- Columna calculada por Postgres para la búsqueda de texto en español.
    busqueda          TSVECTOR GENERATED ALWAYS AS (
                          setweight(to_tsvector('spanish', coalesce(titulo, '')), 'A') ||
                          setweight(to_tsvector('spanish', coalesce(descripcion, '')), 'B')
                      ) STORED,
    CONSTRAINT chk_publicacion_titulo_largo CHECK (char_length(btrim(titulo)) BETWEEN 5 AND 100),
    CONSTRAINT chk_publicacion_fecha_suceso CHECK (fecha_suceso <= fecha_creacion)
);
CREATE INDEX idx_publicacion_coincidencias ON publicacion (tipo, id_categoria, fecha_suceso);
CREATE INDEX idx_publicacion_catalogo      ON publicacion (estado, fecha_creacion DESC);
CREATE INDEX idx_publicacion_busqueda      ON publicacion USING GIN (busqueda);
CREATE INDEX idx_publicacion_id_usuario    ON publicacion (id_usuario);
CREATE INDEX idx_publicacion_id_categoria  ON publicacion (id_categoria);
CREATE INDEX idx_publicacion_id_lugar      ON publicacion (id_lugar);

-- ---------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------
INSERT INTO categoria (nombre, icono, sensible) VALUES
    ('Electrónicos', 'laptop',   FALSE),
    ('Documentos',   'id-card',  TRUE),
    ('Llaves',       'key',      TRUE),
    ('Ropa',         'shirt',    FALSE),
    ('Útiles',       'pencil',   FALSE);

INSERT INTO sede (nombre) VALUES
    ('Facultad de Ingeniería'), ('Macarena'), ('Tecnológica');

INSERT INTO lugar (id_sede, edificio, referencia) VALUES
    (1, 'Edificio Sabio Caldas', 'Piso 3, salones de sistemas'),
    (1, 'Biblioteca',            'Sala de estudio'),
    (2, 'Cafetería',             'Junto a la entrada');

INSERT INTO usuario (nombre, correo, hash_contrasena, programa, rol, verificado, acepto_politica_en) VALUES
    ('Ana Pérez',   'aperez@udistrital.edu.co',  '$2b$12$hashdeprueba', 'Ing. de Sistemas', 'USUARIO',   TRUE, now()),
    ('Luis Gómez',  'lgomez@udistrital.edu.co',  '$2b$12$hashdeprueba', 'Ing. Industrial',  'USUARIO',   TRUE, now()),
    ('Moderadora',  'moder@udistrital.edu.co',   '$2b$12$hashdeprueba', 'Bienestar',        'MODERADOR', TRUE, now());

INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso) VALUES
    (1, 1, 1, 'ENCONTRADO', 'Audífonos inalámbricos negros', 'Encontrados en el salón 301 después de clase', now() - interval '2 days'),
    (2, 1, 2, 'PERDIDO',    'Perdí mis audífonos',           'Audífonos negros con estuche, creo que en la biblioteca', now() - interval '3 days'),
    (2, 2, 3, 'ENCONTRADO', 'Carné estudiantil',             'Carné encontrado en una mesa de la cafetería', now() - interval '1 day');

-- Consulta de ejemplo con JOIN: catálogo con nombres legibles.
SELECT p.id, p.tipo, p.titulo, c.nombre AS categoria, s.nombre AS sede, l.edificio, u.nombre AS autor
FROM publicacion p
JOIN categoria c ON c.id = p.id_categoria
JOIN lugar     l ON l.id = p.id_lugar
JOIN sede      s ON s.id = l.id_sede
JOIN usuario   u ON u.id = p.id_usuario
ORDER BY p.fecha_creacion DESC;
