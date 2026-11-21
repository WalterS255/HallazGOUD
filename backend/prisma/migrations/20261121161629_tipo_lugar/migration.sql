-- CreateEnum
CREATE TYPE "tipo_lugar" AS ENUM ('BIBLIOTECA', 'CAFETERIA', 'LABORATORIO', 'AUDITORIO', 'AULAS', 'EDIFICIO_PRINCIPAL', 'ADMINISTRATIVO', 'OTRO');

-- AlterTable
ALTER TABLE "lugar" ADD COLUMN     "tipo" "tipo_lugar";

-- (A mano) Llenar el tipo de los lugares que ya existen, por su nombre.
-- Prisma no lo genera: el schema describe la forma de las tablas, no sus datos.
-- Lo que no encaje queda en NULL (sin "edificio análogo") hasta que el admin lo elija.
UPDATE "lugar" SET "tipo" = CASE
    WHEN "edificio" ILIKE '%bibliotec%'  THEN 'BIBLIOTECA'::"tipo_lugar"
    WHEN "edificio" ILIKE '%cafeter%'    THEN 'CAFETERIA'::"tipo_lugar"
    WHEN "edificio" ILIKE '%laborator%'  THEN 'LABORATORIO'::"tipo_lugar"
    WHEN "edificio" ILIKE '%auditor%'    THEN 'AUDITORIO'::"tipo_lugar"
    WHEN "edificio" ILIKE ANY (ARRAY['%aula%', '%salon%', '%salón%'])         THEN 'AULAS'::"tipo_lugar"
    WHEN "edificio" ILIKE ANY (ARRAY['%bloque principal%', '%edificio %'])    THEN 'EDIFICIO_PRINCIPAL'::"tipo_lugar"
  END
WHERE "tipo" IS NULL;
