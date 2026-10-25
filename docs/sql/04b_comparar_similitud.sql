-- =====================================================================
-- HallazGO UD · Fase A · Script 04b: comparar dos formas de medir similitud textual
-- Requiere 01 a 04. Todo va dentro de BEGIN … ROLLBACK: no deja datos.
--
--   A) ts_rank normalizado (lo que dice la sección 7)
--   B) Porcentaje de palabras en común:
--        palabras del PERDIDO que también aparecen en el ENCONTRADO
--        ─────────────────────────────────────────────────────────
--                    total de palabras del PERDIDO
-- Las "palabras" son los lexemas del tsvector: ya vienen en minúscula,
-- sin tildes de más, sin palabras vacías (de, la, con…) y en raíz
-- ("perdida" → "perd"), así que "gris" y "grises" cuentan como la misma.
-- =====================================================================
BEGIN;

-- Casos extra, con categoría, sede y día IDÉNTICOS al PERDIDO: solo cambia el texto.
-- Así se ve si cada método distingue un texto parecido de uno que no tiene nada que ver.
INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso) VALUES
 (1, 5, 2, 'ENCONTRADO', 'Cuaderno argollado azul',  'Cuaderno de cálculo con stickers en la portada', now() - interval '10 days'),
 (3, 5, 2, 'ENCONTRADO', 'Casio fx-570 gris con tapa negra', 'Calculadora científica Casio fx-570 gris con tapa negra encontrada en la biblioteca', now() - interval '10 days');

SELECT id AS id_ref FROM publicacion WHERE titulo = 'Calculadora Casio fx-570 perdida' \gset

\echo '===== Palabras (lexemas) del PERDIDO de referencia ====='
SELECT tsvector_to_array(busqueda) AS palabras_referencia FROM publicacion WHERE id = :id_ref;

WITH referencia AS (
    SELECT p.id, p.tipo, p.id_usuario, p.fecha_suceso, p.busqueda,
           tsvector_to_array(p.busqueda) AS palabras,
           to_tsquery('simple', array_to_string(tsvector_to_array(p.busqueda), ' | ')) AS consulta
    FROM publicacion p
    WHERE p.id = :id_ref
),
candidatos AS (   -- mismo prefiltro del script 04
    SELECT c.id, c.titulo, c.busqueda, tsvector_to_array(c.busqueda) AS palabras
    FROM publicacion c
    CROSS JOIN referencia r
    WHERE c.tipo <> r.tipo AND c.estado = 'ACTIVA' AND NOT c.oculta
      AND c.id_usuario <> r.id_usuario
      AND c.fecha_suceso BETWEEN r.fecha_suceso - interval '7 days' AND r.fecha_suceso + interval '7 days'
)
SELECT c.id, c.titulo,
       -- A) ts_rank
       round(20 * ts_rank(c.busqueda, r.consulta, 32)::numeric, 1) AS pts_ts_rank,
       -- B) porcentaje de palabras en común
       (SELECT count(*) FROM unnest(r.palabras) w WHERE w = ANY (c.palabras))  AS en_comun,
       cardinality(r.palabras)                                               AS de_total,
       round(20.0 * (SELECT count(*) FROM unnest(r.palabras) w WHERE w = ANY (c.palabras))
                  / greatest(cardinality(r.palabras), 1), 1)                 AS pts_porcentaje,
       (SELECT string_agg(w, ', ' ORDER BY w) FROM unnest(r.palabras) w WHERE w = ANY (c.palabras)) AS cuales
FROM candidatos c
CROSS JOIN referencia r
ORDER BY pts_porcentaje DESC;

ROLLBACK;
