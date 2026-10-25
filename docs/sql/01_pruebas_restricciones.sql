-- =====================================================================
-- Pruebas a propósito con datos malos para el script 01.
-- Ejecutar justo después de 01_tablas_base.sql con:
--   psql -v ON_ERROR_STOP=0 -f 01_pruebas_restricciones.sql
-- TODAS deben fallar, salvo las marcadas como CONTROL.
-- =====================================================================
\echo '--- P1: correo @gmail.com -> chk_usuario_correo_dominio'
INSERT INTO usuario (nombre, correo, hash_contrasena, acepto_politica_en)
VALUES ('Intruso', 'intruso@gmail.com', '$2b$12$x', now());

\echo '--- P2: dominio parecido pero falso (udistrital.edu.co.fake.com) -> chk_usuario_correo_dominio'
INSERT INTO usuario (nombre, correo, hash_contrasena, acepto_politica_en)
VALUES ('Intruso', 'x@udistrital.edu.co.fake.com', '$2b$12$x', now());

\echo '--- P3: correo repetido (mismo texto exacto) -> uq_usuario_correo'
INSERT INTO usuario (nombre, correo, hash_contrasena, acepto_politica_en)
VALUES ('Ana bis', 'aperez@udistrital.edu.co', '$2b$12$x', now());

\echo '--- P3b: mismo correo cambiando mayúsculas -> uq_usuario_correo (compara en minúsculas)'
INSERT INTO usuario (nombre, correo, hash_contrasena, acepto_politica_en)
VALUES ('Ana impostora', 'APerez@UDistrital.edu.co', '$2b$12$x', now());

\echo '--- P4: registro sin aceptar la política (Ley 1581) -> NOT NULL acepto_politica_en'
INSERT INTO usuario (nombre, correo, hash_contrasena)
VALUES ('Sin consentimiento', 'sincons@udistrital.edu.co', '$2b$12$x');

\echo '--- P5: cuenta ACTIVA sin contraseña -> chk_usuario_datos_si_activa'
INSERT INTO usuario (nombre, correo, acepto_politica_en)
VALUES ('Sin clave', 'sinclave@udistrital.edu.co', now());

\echo '--- P6: rol inventado -> ENUM rol_usuario'
INSERT INTO usuario (nombre, correo, hash_contrasena, rol, acepto_politica_en)
VALUES ('Jefe', 'jefe@udistrital.edu.co', '$2b$12$x', 'SUPERADMIN', now());

\echo '--- P7: intentos fallidos negativos -> CHECK intentos_fallidos'
UPDATE usuario SET intentos_fallidos = -1 WHERE id = 1;

\echo '--- P8: categoría repetida -> UNIQUE nombre'
INSERT INTO categoria (nombre) VALUES ('Llaves');

\echo '--- P9: sede repetida -> UNIQUE nombre'
INSERT INTO sede (nombre) VALUES ('Macarena');

\echo '--- P10: mismo edificio dos veces en la misma sede -> uq_lugar_sede_edificio'
INSERT INTO lugar (id_sede, edificio) VALUES (1, 'Biblioteca');

\echo '--- P11: lugar en una sede que no existe -> llave foránea'
INSERT INTO lugar (id_sede, edificio) VALUES (99, 'Edificio fantasma');

\echo '--- P12: publicación de un usuario que no existe -> llave foránea'
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso)
VALUES (999, 1, 1, 'PERDIDO', 'Perdí mi celular', 'Celular negro', now());

\echo '--- P13: tipo mal escrito PERDIDOO -> ENUM tipo_publicacion'
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso)
VALUES (1, 1, 1, 'PERDIDOO', 'Perdí mi celular', 'Celular negro', now());

\echo '--- P14: título de puros espacios y muy corto -> chk_publicacion_titulo_largo'
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso)
VALUES (1, 1, 1, 'PERDIDO', '  ab  ', 'Celular negro', now());

\echo '--- P15: objeto "perdido" en el futuro -> chk_publicacion_fecha_suceso'
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso)
VALUES (1, 1, 1, 'PERDIDO', 'Perdí mi celular', 'Celular negro', now() + interval '1 day');

\echo '--- P16: escribir a mano la columna generada busqueda -> no se permite'
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso, busqueda)
VALUES (1, 1, 1, 'PERDIDO', 'Perdí mi celular', 'Celular negro', now(), 'trampa');

\echo '--- CONTROL 1 (debe funcionar): correo institucional con MAYÚSCULAS (el ~* ignora mayúsculas)'
INSERT INTO usuario (nombre, correo, hash_contrasena, acepto_politica_en)
VALUES ('Carlos Ruiz', 'CRuiz@UDistrital.edu.co', '$2b$12$x', now());

\echo '--- CONTROL 2 (debe funcionar): anonimizar a Carlos (Ley 1581): se borran datos, se conserva el id'
UPDATE usuario SET nombre = NULL, correo = NULL, hash_contrasena = NULL, foto_url = NULL,
                   estado_cuenta = 'ELIMINADA'
WHERE correo = 'CRuiz@UDistrital.edu.co';
SELECT id, nombre, correo, estado_cuenta FROM usuario WHERE estado_cuenta = 'ELIMINADA';

\echo '--- CONTROL 2b (debe funcionar): anonimizar a un segundo usuario; varios correos NULL no chocan'
UPDATE usuario SET nombre = NULL, correo = NULL, hash_contrasena = NULL, estado_cuenta = 'ELIMINADA'
WHERE id = 2;
SELECT count(*) AS cuentas_anonimizadas FROM usuario WHERE correo IS NULL;

\echo '--- CONTROL 3: busqueda se calculó sola a partir del título y la descripción'
SELECT id, titulo, busqueda FROM publicacion WHERE id = 1;
