-- AlterTable
-- Pista PÚBLICA sobre el detalle reservado ("¿Qué tiene pegado en la base?"): orienta
-- a quien reclama sin revelar la respuesta. Opcional; solo en un ENCONTRADO.
ALTER TABLE "publicacion" ADD COLUMN "pista" VARCHAR(150);

-- CHECK: Prisma no tiene sintaxis para restricciones CHECK (igual que en init).
ALTER TABLE "publicacion"
    ADD CONSTRAINT "chk_publicacion_pista" CHECK (
        "pista" IS NULL OR ("tipo" = 'ENCONTRADO' AND char_length(btrim("pista")) >= 3)
    );
