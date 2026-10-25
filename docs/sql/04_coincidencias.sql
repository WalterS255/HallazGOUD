-- =====================================================================
-- HallazGO UD · Fase A · Script 04: práctica del motor de coincidencias (sección 7)
-- Requiere 01, 02 y 03. Agrega datos de prueba con casos límite y calcula el puntaje.
--
--   Misma categoría ............ 35
--   Misma sede ................. 20   (edificio análogo: pendiente, pregunta abierta 13.2)
--   Proximidad temporal ........ 25 × (1 − |Δdías| / 7), 0 si pasa de 7 días
--   Similitud textual .......... 20 × (palabras de la referencia que aparecen en el candidato
--                                       / total de palabras de la referencia)
--                                  (antes era ts_rank; ver comparación en 04b_comparar_similitud.sql)
--   Se muestra si total > 50.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Datos de prueba. Todo va en UNA transacción para que now() valga lo mismo
-- en cada INSERT (now() se congela al inicio de la transacción). Así las
-- distancias de 0, 7 y 8 días son exactas.
-- Referencia: un PERDIDO de hace 10 días (Luis, Útiles, Biblioteca, sede 1).
-- ---------------------------------------------------------------------
BEGIN;

INSERT INTO lugar (id_sede, edificio, referencia) VALUES (3, 'Bloque de laboratorios', 'Primer piso');

INSERT INTO publicacion (id_usuario, id_categoria, id_lugar, tipo, titulo, descripcion, fecha_suceso, estado, oculta) VALUES
 -- La referencia (PERDIDO)
 (2, 5, 2, 'PERDIDO',    'Calculadora Casio fx-570 perdida', 'Calculadora científica gris con tapa negra, la dejé en la biblioteca', now() - interval '10 days', 'ACTIVA', FALSE),
 -- C1: mismo día, misma categoría y sede, texto parecido -> puntaje alto
 (1, 5, 2, 'ENCONTRADO', 'Calculadora científica encontrada', 'Calculadora Casio gris en una mesa de la biblioteca',          now() - interval '10 days', 'ACTIVA', FALSE),
 -- C2: exactamente 7 días después -> tiempo = 0, pero sigue en la ventana
 (3, 5, 1, 'ENCONTRADO', 'Calculadora en el salón 305',      'Calculadora gris olvidada después del parcial',                now() - interval '3 days',  'ACTIVA', FALSE),
 -- C3: 8 días después -> el prefiltro lo descarta
 (1, 5, 2, 'ENCONTRADO', 'Calculadora Casio encontrada',     'Calculadora científica gris con tapa',                         now() - interval '2 days',  'ACTIVA', FALSE),
 -- C4: 3 días antes, misma categoría, OTRA sede -> queda cerca del umbral
 (3, 5, 3, 'ENCONTRADO', 'Calculadora en la cafetería',      'Calculadora científica sin tapa',                              now() - interval '13 days', 'ACTIVA', FALSE),
 -- C5: 1 día después, misma sede, OTRA categoría -> no llega a 50
 (1, 1, 1, 'ENCONTRADO', 'Calculadora gráfica',              'Encontré una calculadora gráfica en el pasillo',               now() - interval '9 days',  'ACTIVA', FALSE),
 -- C6: perfecta pero ya ENTREGADA -> el prefiltro la descarta
 (3, 5, 2, 'ENCONTRADO', 'Calculadora Casio gris',           'Calculadora científica en la biblioteca',                      now() - interval '10 days', 'ENTREGADA', FALSE),
 -- C7: perfecta pero OCULTA por moderación -> el prefiltro la descarta
 (3, 5, 2, 'ENCONTRADO', 'Calculadora Casio fx-570',         'Calculadora científica gris',                                  now() - interval '10 days', 'ACTIVA', TRUE),
 -- C8: del mismo autor del PERDIDO -> no tiene sentido sugerírsela a él mismo
 (2, 5, 2, 'ENCONTRADO', 'Calculadora encontrada',           'Calculadora científica gris',                                  now() - interval '10 days', 'ACTIVA', FALSE);

COMMIT;

-- ---------------------------------------------------------------------
-- La consulta del motor. Recibe :id_ref (cualquier publicación) y busca
-- las del tipo OPUESTO; así la misma consulta sirve en los dos sentidos:
--   PERDIDO nuevo    -> sugerencias para su autor            (RF-23)
--   ENCONTRADO nuevo -> a qué autores de PERDIDO notificar   (RF-24)
-- ---------------------------------------------------------------------
\echo '===== Caso 1: sugerencias para el PERDIDO de la calculadora ====='
SELECT id AS id_ref FROM publicacion WHERE titulo = 'Calculadora Casio fx-570 perdida' \gset

WITH referencia AS (
    SELECT p.id, p.tipo, p.id_categoria, l.id_sede, p.fecha_suceso, p.id_usuario,
           -- Las palabras de la referencia ya normalizadas: minúscula, en raíz y sin palabras vacías.
           tsvector_to_array(p.busqueda) AS palabras
    FROM publicacion p
    JOIN lugar l ON l.id = p.id_lugar
    WHERE p.id = :id_ref
),
candidatos AS (   -- PREFILTRO en SQL: aquí se descarta casi toda la tabla usando índices
    SELECT c.id, c.titulo, c.id_categoria, l.id_sede, c.fecha_suceso, c.id_usuario,
           tsvector_to_array(c.busqueda) AS palabras
    FROM publicacion c
    JOIN lugar l ON l.id = c.id_lugar
    CROSS JOIN referencia r
    WHERE c.tipo <> r.tipo
      AND c.estado = 'ACTIVA'
      AND NOT c.oculta
      AND c.id_usuario <> r.id_usuario
      AND c.fecha_suceso BETWEEN r.fecha_suceso - interval '7 days'
                             AND r.fecha_suceso + interval '7 days'
),
puntajes AS (     -- PONDERACIÓN: solo sobre los pocos que pasaron el prefiltro
    SELECT c.id, c.titulo,
           abs(extract(epoch FROM c.fecha_suceso - r.fecha_suceso)) / 86400          AS dias,
           CASE WHEN c.id_categoria = r.id_categoria THEN 35 ELSE 0 END             AS pts_categoria,
           CASE WHEN c.id_sede      = r.id_sede      THEN 20 ELSE 0 END             AS pts_sede,
           25 * greatest(0, 1 - abs(extract(epoch FROM c.fecha_suceso - r.fecha_suceso)) / 86400 / 7) AS pts_tiempo,
           -- Cuántas palabras de la referencia están en el candidato, sobre el total.
           -- greatest(…, 1) evita dividir por cero si la referencia no tiene palabras.
           20.0 * (SELECT count(*) FROM unnest(r.palabras) w WHERE w = ANY (c.palabras))
                / greatest(cardinality(r.palabras), 1)                               AS pts_texto
    FROM candidatos c
    CROSS JOIN referencia r
)
SELECT id, titulo,
       round(dias, 1)        AS dias,
       pts_categoria         AS cat,
       pts_sede              AS sede,
       round(pts_tiempo, 1)  AS tiempo,
       round(pts_texto, 1)   AS texto,
       round(pts_categoria + pts_sede + pts_tiempo + pts_texto, 1) AS total,
       (pts_categoria + pts_sede + pts_tiempo + pts_texto) > 50     AS se_muestra
FROM puntajes
ORDER BY total DESC;

\echo '===== ¿Quiénes NO llegaron al cálculo? (descartados por el prefiltro) ====='
SELECT c.id, c.titulo, c.estado, c.oculta,
       round(extract(epoch FROM c.fecha_suceso - r.fecha_suceso) / 86400, 1) AS dias,
       CASE WHEN c.id_usuario = r.id_usuario THEN 'mismo autor'
            WHEN c.estado <> 'ACTIVA'        THEN 'no está ACTIVA'
            WHEN c.oculta                    THEN 'oculta'
            ELSE 'fuera de ±7 días' END AS por_que
FROM publicacion c
CROSS JOIN (SELECT * FROM publicacion WHERE id = :id_ref) r
WHERE c.tipo = 'ENCONTRADO' AND c.titulo ILIKE '%calculadora%'
  AND NOT (c.estado = 'ACTIVA' AND NOT c.oculta AND c.id_usuario <> r.id_usuario
           AND c.fecha_suceso BETWEEN r.fecha_suceso - interval '7 days' AND r.fecha_suceso + interval '7 days')
ORDER BY c.id;
