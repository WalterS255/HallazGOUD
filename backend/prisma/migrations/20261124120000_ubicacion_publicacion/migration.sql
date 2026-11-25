-- AlterTable
-- Dónde exactamente se encontró o se perdió el objeto, en texto libre
-- ("cuarto piso, al lado de una mesa"). Se publica con la sede; el edificio del
-- catálogo queda como "General" de esa sede (gestion.service.ts).
-- NULL en las publicaciones anteriores: esas siguen mostrando su edificio.
ALTER TABLE "publicacion" ADD COLUMN "ubicacion" VARCHAR(200);
