-- Datos para la prueba de carga (RNF-01: 10.000 publicaciones y 200 usuarios).
-- Mismo volumen y forma que docs/sql/05_rendimiento.sql (Fase A), sobre una base
-- creada con las migraciones de Prisma. Solo se carga en hallazgo_carga (preparar-bd.sh).

INSERT INTO categoria (nombre) SELECT 'Categoría ' || g FROM generate_series(1, 8) g;
INSERT INTO sede (nombre) SELECT 'Sede ' || g FROM generate_series(1, 8) g;
INSERT INTO lugar (id_sede, edificio, tipo)
SELECT s, 'Edificio ' || e,
       (ARRAY['BIBLIOTECA','CAFETERIA','LABORATORIO','AULAS','EDIFICIO_PRINCIPAL']::tipo_lugar[])[e]
FROM generate_series(1, 8) s, generate_series(1, 5) e;
INSERT INTO usuario (nombre, correo, hash_contrasena, verificado, acepto_politica_en)
SELECT 'Usuario ' || g, 'carga' || g || '@udistrital.edu.co', 'sin-login', true, now()
FROM generate_series(1, 200) g;

-- Palabras repetidas a propósito para que la búsqueda de texto encuentre resultados.
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion,
                         fecha_suceso, estado, fecha_creacion, ultima_actividad)
SELECT 1 + (g % 200),
       1 + (g % 8),
       1 + (g % 40),
       CASE WHEN g % 2 = 0 THEN 'PERDIDO' ELSE 'ENCONTRADO' END::tipo_publicacion,
       (ARRAY['Calculadora','Audífonos','Carné','Llaves','Sombrilla','Cuaderno','Termo','Chaqueta'])[1 + g % 8]
         || ' ' || (ARRAY['negra','gris','azul','roja','verde'])[1 + g % 5],
       'Objeto ' || (ARRAY['encontrado','perdido','olvidado'])[1 + g % 3] || ' en el salón ' || (100 + g % 400),
       now() - (g % 365) * interval '1 day' - interval '1 hour',
       CASE WHEN g % 10 < 7 THEN 'ACTIVA' WHEN g % 10 < 9 THEN 'ENTREGADA' ELSE 'EXPIRADA' END::estado_publicacion,
       now() - (g % 365) * interval '1 day',
       now()
FROM generate_series(1, 10000) g;

-- Estadísticas al día para que PostgreSQL elija bien los índices.
ANALYZE;

SELECT estado, count(*) FROM publicacion GROUP BY estado ORDER BY estado;
