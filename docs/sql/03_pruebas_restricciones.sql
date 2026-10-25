-- =====================================================================
-- Pruebas a propósito con datos malos para el script 03.
-- Ejecutar con: psql -v ON_ERROR_STOP=0 -f 03_pruebas_restricciones.sql
-- TODAS deben fallar, salvo las marcadas como CONTROL.
-- =====================================================================
\echo '--- P1: token guardado en claro (no es un hash) -> CHECK token_hash'
INSERT INTO token_usuario (id_usuario, tipo, token_hash, expira_en)
VALUES (1, 'RECUPERACION', 'mi-token-en-claro', now() + interval '1 hour');

\echo '--- P2: token que expira antes de crearse -> chk_token_expira'
INSERT INTO token_usuario (id_usuario, tipo, token_hash, expira_en)
VALUES (1, 'RECUPERACION', encode(sha256('otro'::bytea), 'hex'), now() - interval '1 hour');

\echo '--- P3: mismo hash dos veces -> UNIQUE token_hash'
INSERT INTO token_usuario (id_usuario, tipo, token_hash, expira_en)
VALUES (2, 'VERIFICACION', encode(sha256('token-de-prueba-ana'::bytea), 'hex'), now() + interval '1 day');

\echo '--- P4: historial sin cambio real (ACTIVA -> ACTIVA) -> chk_historial_cambio_real'
INSERT INTO historial_estado (id_publicacion, estado_anterior, estado_nuevo) VALUES (2, 'ACTIVA', 'ACTIVA');

\echo '--- P5: tipo de notificación inventado -> ENUM'
INSERT INTO notificacion (id_usuario, tipo, mensaje) VALUES (1, 'PROMOCION', 'Compra ya');

\echo '--- P6: notificación vacía -> CHECK mensaje'
INSERT INTO notificacion (id_usuario, tipo, mensaje) VALUES (1, 'MENSAJE', '  ');

\echo '--- P7: mismo usuario reporta otra vez la pub 3 (sigue pendiente) -> uq_reporte_pendiente_por_usuario'
INSERT INTO reporte (id_publicacion, id_reportante, motivo) VALUES (3, 1, 'Lo reporto de nuevo');

\echo '--- P8: reporte RESUELTO sin moderador -> chk_reporte_resolucion'
UPDATE reporte SET estado = 'RESUELTO', fecha_resolucion = now() WHERE id = 1;

\echo '--- P9: IP mal escrita -> tipo INET'
INSERT INTO auditoria (accion, entidad, ip) VALUES ('LOGIN', 'usuario', '999.1.1.1');

\echo '--- P10: modificar auditoría -> trigger de inmutabilidad (UPDATE)'
UPDATE auditoria SET accion = 'NADA_PASO' WHERE id = 1;

\echo '--- P11: borrar auditoría -> trigger de inmutabilidad (DELETE)'
DELETE FROM auditoria WHERE id = 1;

\echo '--- P12: vaciar auditoría -> trigger de inmutabilidad (TRUNCATE)'
TRUNCATE auditoria;

\echo '--- CONTROL 1 (debe funcionar): el moderador resuelve el reporte correctamente'
UPDATE reporte SET estado = 'RESUELTO', id_moderador = 3, fecha_resolucion = now() WHERE id = 1;

\echo '--- CONTROL 2 (debe funcionar): después de resolver, el usuario sí puede volver a reportar'
INSERT INTO reporte (id_publicacion, id_reportante, motivo) VALUES (3, 1, 'Volvieron a subir la foto');

\echo '--- CONTROL 3: la auditoría sigue intacta (2 filas)'
SELECT id, accion, ip FROM auditoria ORDER BY id;
