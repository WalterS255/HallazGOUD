-- =====================================================================
-- Pruebas a propósito con datos malos para el script 02.
-- Ejecutar con: psql -v ON_ERROR_STOP=0 -f 02_pruebas_restricciones.sql
-- TODAS deben fallar. El mensaje de error esperado va en el comentario.
-- =====================================================================
\echo '--- P1: detalle reservado en un PERDIDO (pub 2) -> trigger'
INSERT INTO detalle_reservado (id_publicacion, texto) VALUES (2, 'no debería poder');

\echo '--- P2: segundo detalle para la misma publicación -> llave primaria duplicada'
INSERT INTO detalle_reservado (id_publicacion, texto) VALUES (1, 'otro detalle');

\echo '--- P3: imagen en posición 6 -> CHECK orden BETWEEN 1 AND 5'
INSERT INTO imagen (id_publicacion, url, url_miniatura, orden) VALUES (1, 'x', 'x', 6);

\echo '--- P4: dos imágenes en la misma posición -> uq_imagen_publicacion_orden'
INSERT INTO imagen (id_publicacion, url, url_miniatura, orden) VALUES (1, 'x', 'x', 1);

\echo '--- P5: segunda reclamación ACEPTADA en la pub 1 -> uq_reclamacion_una_aceptada'
INSERT INTO reclamacion (id_publicacion, id_reclamante, respuesta_detalle, estado, fecha_resolucion)
VALUES (1, 3, 'Un sticker', 'ACEPTADA', now());

\echo '--- P6: mismo usuario, dos PENDIENTE sobre la pub 3 -> uq_reclamacion_pendiente_por_usuario'
INSERT INTO reclamacion (id_publicacion, id_reclamante, respuesta_detalle) VALUES (3, 1, 'Esquina doblada');
INSERT INTO reclamacion (id_publicacion, id_reclamante, respuesta_detalle) VALUES (3, 1, 'Esquina doblada otra vez');

\echo '--- P7: reclamación RECHAZADA sin fecha de resolución -> chk_reclamacion_resolucion'
INSERT INTO reclamacion (id_publicacion, id_reclamante, respuesta_detalle, estado) VALUES (3, 3, 'algo', 'RECHAZADA');

\echo '--- P8: estado inventado -> el ENUM lo rechaza'
INSERT INTO reclamacion (id_publicacion, id_reclamante, respuesta_detalle, estado) VALUES (3, 3, 'algo', 'APROBADA');

\echo '--- P9: segunda entrega para la reclamación 1 -> UNIQUE id_reclamacion'
INSERT INTO entrega (id_reclamacion) VALUES (1);

\echo '--- P10: solo el autor confirma pero ponen fecha_entrega -> chk_entrega_doble_confirmacion'
UPDATE entrega SET confirmo_autor = TRUE, fecha_entrega = now() WHERE id_reclamacion = 1;

\echo '--- P11: mensaje vacío -> CHECK de contenido'
INSERT INTO mensaje (id_reclamacion, id_emisor, contenido) VALUES (1, 1, '   ');

\echo '--- P12: mensaje en una reclamación que no existe -> llave foránea'
INSERT INTO mensaje (id_reclamacion, id_emisor, contenido) VALUES (999, 1, 'hola');

\echo '--- CONTROL (debe funcionar): doble confirmación correcta'
UPDATE entrega SET confirmo_autor = TRUE, confirmo_reclamante = TRUE, fecha_entrega = now() WHERE id_reclamacion = 1;
SELECT id_reclamacion, confirmo_autor, confirmo_reclamante, fecha_entrega IS NOT NULL AS entregada FROM entrega;
