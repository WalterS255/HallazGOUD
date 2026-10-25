-- =====================================================================
-- HallazGO UD · Script 05: rendimiento con volumen realista (RNF-01)
-- RNF-01: listado filtrado < 2 s con 10.000 publicaciones y 200 usuarios.
--
-- Se ejecuta sobre una base CREADA CON LA MIGRACIÓN DE PRISMA (no la de práctica):
--   docker compose exec db createdb -U hallazgo hallazgo_rendimiento
--   docker compose exec -T db psql -U hallazgo -d hallazgo_rendimiento < backend/prisma/migrations/<init>/migration.sql
--   docker compose exec -T db psql -U hallazgo -d hallazgo_rendimiento < docs/sql/05_rendimiento.sql
--
-- EXPLAIN ANALYZE ejecuta la consulta de verdad y muestra el plan: cómo la resolvió
-- Postgres ("Index Scan" = usó un índice; "Seq Scan" = recorrió toda la tabla) y
-- cuánto tardó ("Execution Time").
-- =====================================================================
\timing on

-- ---- Datos: 200 usuarios, 8 categorías, 8 sedes × 5 lugares, 10.000 publicaciones
INSERT INTO categoria (nombre) SELECT 'Categoría ' || g FROM generate_series(1, 8) g;
INSERT INTO sede (nombre) SELECT 'Sede ' || g FROM generate_series(1, 8) g;
INSERT INTO lugar (id_sede, edificio) SELECT s, 'Edificio ' || e FROM generate_series(1, 8) s, generate_series(1, 5) e;
INSERT INTO usuario (nombre, correo, hash_contrasena, acepto_politica_en)
SELECT 'Usuario ' || g, 'u' || g || '@udistrital.edu.co', 'x', now() FROM generate_series(1, 200) g;

-- Palabras al azar para que la búsqueda de texto tenga algo realista que buscar.
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso, estado, fecha_creacion)
SELECT 1 + (g % 200),
       1 + (g % 8),
       1 + (g % 40),
       CASE WHEN g % 2 = 0 THEN 'PERDIDO' ELSE 'ENCONTRADO' END::tipo_publicacion,
       (ARRAY['Calculadora','Audífonos','Carné','Llaves','Sombrilla','Cuaderno','Termo','Chaqueta'])[1 + g % 8]
         || ' ' || (ARRAY['negra','gris','azul','roja','verde'])[1 + g % 5],
       'Objeto ' || (ARRAY['encontrado','perdido','olvidado'])[1 + g % 3] || ' en el salón ' || (100 + g % 400),
       now() - (g % 365) * interval '1 day' - interval '1 hour',
       CASE WHEN g % 10 < 7 THEN 'ACTIVA' WHEN g % 10 < 9 THEN 'ENTREGADA' ELSE 'EXPIRADA' END::estado_publicacion,
       now() - (g % 365) * interval '1 day'
FROM generate_series(1, 10000) g;

-- Actualiza las estadísticas que usa el planificador para elegir índices.
ANALYZE;

\echo '===== 1) Catálogo: ACTIVAS de una categoría y sede, más recientes primero (página 1)'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT p.id, p.titulo, p.fecha_creacion
FROM publicacion p JOIN lugar l ON l.id = p.id_lugar
WHERE p.estado = 'ACTIVA' AND NOT p.oculta AND p.id_categoria = 3 AND l.id_sede = 2
ORDER BY p.fecha_creacion DESC
LIMIT 20;

\echo '===== 2) Búsqueda de texto ("calculadoras grises") ordenada por relevancia'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id, titulo, ts_rank(busqueda, q) AS relevancia
FROM publicacion, plainto_tsquery('spanish', 'calculadoras grises') q
WHERE estado = 'ACTIVA' AND busqueda @@ q
ORDER BY relevancia DESC
LIMIT 20;

\echo '===== 3) Prefiltro del motor de coincidencias (±7 días, misma categoría)'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT c.id
FROM publicacion c
WHERE c.tipo = 'ENCONTRADO' AND c.id_categoria = 3 AND c.estado = 'ACTIVA' AND NOT c.oculta
  AND c.fecha_suceso BETWEEN now() - interval '37 days' AND now() - interval '23 days';

\echo '===== 4) Total para la paginación ({ total } de la respuesta)'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT count(*) FROM publicacion WHERE estado = 'ACTIVA' AND NOT oculta AND id_categoria = 3;
