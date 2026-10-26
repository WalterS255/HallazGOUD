-- =====================================================================
-- HallazGO UD · rol de la aplicación con permisos MÍNIMOS
--
-- Problema: si el backend se conecta como dueño de las tablas (el usuario de
-- POSTGRES_USER), un fallo o un ataque de inyección podría hacer DROP TABLE,
-- desactivar el trigger de la auditoría o borrar todo. El trigger de inmutabilidad
-- frena UPDATE/DELETE/TRUNCATE, pero el DUEÑO siempre puede saltárselo.
--
-- Solución: dos usuarios de Postgres.
--   * hallazgo (dueño)      → solo para migraciones (prisma migrate deploy) y respaldos.
--   * hallazgo_app (este)   → el que usa el backend en producción: lee y escribe
--                             datos, pero no puede cambiar la estructura ni la auditoría.
--
-- Uso (una vez por base; se puede repetir sin problema):
--   docker compose exec -T db psql -U hallazgo -d hallazgo_ud \
--     -v clave_app='<contraseña larga>' < infra/bd/roles.sql
-- La contraseña llega como variable de psql para que nunca quede escrita en este archivo;
-- :'clave_app' hace que psql la ponga entre comillas y escape cualquier carácter raro.
-- =====================================================================
\set ON_ERROR_STOP on

-- Crear el rol si no existe (CREATE ROLE no tiene "IF NOT EXISTS").
SELECT format('CREATE ROLE hallazgo_app LOGIN PASSWORD %L', :'clave_app')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hallazgo_app') \gexec
-- Si ya existía, se actualiza la contraseña (así este script sirve para rotarla).
ALTER ROLE hallazgo_app LOGIN PASSWORD :'clave_app' NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Conectarse y usar el esquema, pero NO crear objetos en él.
SELECT format('GRANT CONNECT ON DATABASE %I TO hallazgo_app', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO hallazgo_app;
REVOKE CREATE ON SCHEMA public FROM hallazgo_app;

-- Datos: leer y escribir en todas las tablas…
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hallazgo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hallazgo_app;

-- …salvo la auditoría: solo agregar y leer (el trigger es la segunda barrera).
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM hallazgo_app;
-- La tabla interna de Prisma: el backend no tiene por qué tocarla.
-- (Condicional: no existe si la migración se aplicó con psql y no con Prisma.)
SELECT 'REVOKE ALL ON _prisma_migrations FROM hallazgo_app'
WHERE to_regclass('public._prisma_migrations') IS NOT NULL \gexec

-- Tablas que creen las migraciones FUTURAS (hechas por el dueño) heredan los mismos
-- permisos de datos. OJO: si una migración crea otra tabla "solo agregar", hay que
-- repetir el REVOKE para ella.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hallazgo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hallazgo_app;

\echo 'Rol hallazgo_app listo.'
