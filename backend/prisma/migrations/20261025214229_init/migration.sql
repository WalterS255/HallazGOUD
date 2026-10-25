-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('USUARIO', 'MODERADOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "estado_cuenta" AS ENUM ('ACTIVA', 'SUSPENDIDA', 'ELIMINADA');

-- CreateEnum
CREATE TYPE "tipo_publicacion" AS ENUM ('PERDIDO', 'ENCONTRADO');

-- CreateEnum
CREATE TYPE "estado_publicacion" AS ENUM ('ACTIVA', 'EN_RECLAMACION', 'ENTREGADA', 'EXPIRADA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "estado_reclamacion" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "tipo_token" AS ENUM ('VERIFICACION', 'RECUPERACION');

-- CreateEnum
CREATE TYPE "tipo_notificacion" AS ENUM ('COINCIDENCIA', 'RECLAMACION', 'MENSAJE', 'ESTADO', 'MODERACION');

-- CreateEnum
CREATE TYPE "estado_reporte" AS ENUM ('PENDIENTE', 'RESUELTO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120),
    "correo" VARCHAR(160),
    "hash_contrasena" VARCHAR(100),
    "programa" VARCHAR(160),
    "foto_url" TEXT,
    "rol" "rol_usuario" NOT NULL DEFAULT 'USUARIO',
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "estado_cuenta" "estado_cuenta" NOT NULL DEFAULT 'ACTIVA',
    "notificar_por_correo" BOOLEAN NOT NULL DEFAULT true,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(6),
    "acepto_politica_en" TIMESTAMPTZ(6) NOT NULL,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_usuario" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "tipo" "tipo_token" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "usado_en" TIMESTAMPTZ(6),

    CONSTRAINT "token_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "icono" VARCHAR(60),
    "sensible" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sede" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,

    CONSTRAINT "sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lugar" (
    "id" SERIAL NOT NULL,
    "id_sede" INTEGER NOT NULL,
    "edificio" VARCHAR(100) NOT NULL,
    "referencia" VARCHAR(200),

    CONSTRAINT "lugar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publicacion" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_categoria" INTEGER NOT NULL,
    "id_lugar" INTEGER NOT NULL,
    "tipo" "tipo_publicacion" NOT NULL,
    "titulo" VARCHAR(100) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha_suceso" TIMESTAMPTZ(6) NOT NULL,
    "estado" "estado_publicacion" NOT NULL DEFAULT 'ACTIVA',
    "oculta" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_actividad" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- [MANUAL] Prisma escribió "tsvector" a secas: no sabe declarar columnas GENERADAS.
    "busqueda" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('spanish', coalesce("titulo", '')), 'A') ||
        setweight(to_tsvector('spanish', coalesce("descripcion", '')), 'B')
    ) STORED,

    CONSTRAINT "publicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_reservado" (
    "id_publicacion" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "detalle_reservado_pkey" PRIMARY KEY ("id_publicacion")
);

-- CreateTable
CREATE TABLE "imagen" (
    "id" SERIAL NOT NULL,
    "id_publicacion" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "url_miniatura" TEXT NOT NULL,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "imagen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_estado" (
    "id" SERIAL NOT NULL,
    "id_publicacion" INTEGER NOT NULL,
    "estado_anterior" "estado_publicacion",
    "estado_nuevo" "estado_publicacion" NOT NULL,
    "id_usuario" INTEGER,
    "motivo" VARCHAR(300),
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_estado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reclamacion" (
    "id" SERIAL NOT NULL,
    "id_publicacion" INTEGER NOT NULL,
    "id_reclamante" INTEGER NOT NULL,
    "respuesta_detalle" TEXT NOT NULL,
    "evidencia_url" TEXT,
    "estado" "estado_reclamacion" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resolucion" TIMESTAMPTZ(6),

    CONSTRAINT "reclamacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensaje" (
    "id" SERIAL NOT NULL,
    "id_reclamacion" INTEGER NOT NULL,
    "id_emisor" INTEGER NOT NULL,
    "contenido" TEXT NOT NULL,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "fecha_envio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrega" (
    "id" SERIAL NOT NULL,
    "id_reclamacion" INTEGER NOT NULL,
    "confirmo_autor" BOOLEAN NOT NULL DEFAULT false,
    "confirmo_reclamante" BOOLEAN NOT NULL DEFAULT false,
    "fecha_entrega" TIMESTAMPTZ(6),

    CONSTRAINT "entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "tipo" "tipo_notificacion" NOT NULL,
    "mensaje" VARCHAR(300) NOT NULL,
    "id_referencia" INTEGER,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporte" (
    "id" SERIAL NOT NULL,
    "id_publicacion" INTEGER NOT NULL,
    "id_reportante" INTEGER NOT NULL,
    "motivo" VARCHAR(500) NOT NULL,
    "estado" "estado_reporte" NOT NULL DEFAULT 'PENDIENTE',
    "id_moderador" INTEGER,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resolucion" TIMESTAMPTZ(6),

    CONSTRAINT "reporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "id_usuario" INTEGER,
    "accion" VARCHAR(60) NOT NULL,
    "entidad" VARCHAR(60) NOT NULL,
    "id_entidad" INTEGER,
    "detalle" JSONB NOT NULL DEFAULT '{}',
    "ip" INET,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_usuario_token_hash_key" ON "token_usuario"("token_hash");

-- CreateIndex
CREATE INDEX "token_usuario_id_usuario_tipo_idx" ON "token_usuario"("id_usuario", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nombre_key" ON "categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "sede_nombre_key" ON "sede"("nombre");

-- CreateIndex
CREATE INDEX "lugar_id_sede_idx" ON "lugar"("id_sede");

-- CreateIndex
CREATE UNIQUE INDEX "lugar_id_sede_edificio_key" ON "lugar"("id_sede", "edificio");

-- CreateIndex
CREATE INDEX "idx_publicacion_coincidencias" ON "publicacion"("tipo", "id_categoria", "fecha_suceso");

-- CreateIndex
CREATE INDEX "idx_publicacion_catalogo" ON "publicacion"("estado", "fecha_creacion" DESC);

-- CreateIndex
CREATE INDEX "publicacion_id_usuario_idx" ON "publicacion"("id_usuario");

-- CreateIndex
CREATE INDEX "publicacion_id_categoria_idx" ON "publicacion"("id_categoria");

-- CreateIndex
CREATE INDEX "publicacion_id_lugar_idx" ON "publicacion"("id_lugar");

-- CreateIndex
CREATE UNIQUE INDEX "imagen_id_publicacion_orden_key" ON "imagen"("id_publicacion", "orden");

-- CreateIndex
CREATE INDEX "historial_estado_id_publicacion_fecha_idx" ON "historial_estado"("id_publicacion", "fecha");

-- CreateIndex
CREATE INDEX "historial_estado_id_usuario_idx" ON "historial_estado"("id_usuario");

-- CreateIndex
CREATE INDEX "reclamacion_id_publicacion_idx" ON "reclamacion"("id_publicacion");

-- CreateIndex
CREATE INDEX "reclamacion_id_reclamante_idx" ON "reclamacion"("id_reclamante");

-- CreateIndex
CREATE UNIQUE INDEX "uq_reclamacion_una_aceptada" ON "reclamacion"("id_publicacion") WHERE (estado = 'ACEPTADA');

-- CreateIndex
CREATE UNIQUE INDEX "uq_reclamacion_pendiente_por_usuario" ON "reclamacion"("id_publicacion", "id_reclamante") WHERE (estado = 'PENDIENTE');

-- CreateIndex
CREATE INDEX "idx_mensaje_hilo" ON "mensaje"("id_reclamacion", "fecha_envio");

-- CreateIndex
CREATE INDEX "mensaje_id_emisor_idx" ON "mensaje"("id_emisor");

-- CreateIndex
CREATE UNIQUE INDEX "entrega_id_reclamacion_key" ON "entrega"("id_reclamacion");

-- CreateIndex
CREATE INDEX "notificacion_id_usuario_leida_fecha_idx" ON "notificacion"("id_usuario", "leida", "fecha" DESC);

-- CreateIndex
CREATE INDEX "idx_reporte_bandeja" ON "reporte"("estado", "fecha");

-- CreateIndex
CREATE INDEX "reporte_id_publicacion_idx" ON "reporte"("id_publicacion");

-- CreateIndex
CREATE INDEX "reporte_id_reportante_idx" ON "reporte"("id_reportante");

-- CreateIndex
CREATE INDEX "reporte_id_moderador_idx" ON "reporte"("id_moderador");

-- CreateIndex
CREATE UNIQUE INDEX "uq_reporte_pendiente_por_usuario" ON "reporte"("id_publicacion", "id_reportante") WHERE (estado = 'PENDIENTE');

-- CreateIndex
CREATE INDEX "auditoria_entidad_id_entidad_idx" ON "auditoria"("entidad", "id_entidad");

-- CreateIndex
CREATE INDEX "auditoria_id_usuario_fecha_idx" ON "auditoria"("id_usuario", "fecha");

-- CreateIndex
CREATE INDEX "auditoria_fecha_idx" ON "auditoria"("fecha");

-- AddForeignKey
ALTER TABLE "token_usuario" ADD CONSTRAINT "token_usuario_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lugar" ADD CONSTRAINT "lugar_id_sede_fkey" FOREIGN KEY ("id_sede") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_id_categoria_fkey" FOREIGN KEY ("id_categoria") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_id_lugar_fkey" FOREIGN KEY ("id_lugar") REFERENCES "lugar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_reservado" ADD CONSTRAINT "detalle_reservado_id_publicacion_fkey" FOREIGN KEY ("id_publicacion") REFERENCES "publicacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagen" ADD CONSTRAINT "imagen_id_publicacion_fkey" FOREIGN KEY ("id_publicacion") REFERENCES "publicacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado" ADD CONSTRAINT "historial_estado_id_publicacion_fkey" FOREIGN KEY ("id_publicacion") REFERENCES "publicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_estado" ADD CONSTRAINT "historial_estado_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacion" ADD CONSTRAINT "reclamacion_id_publicacion_fkey" FOREIGN KEY ("id_publicacion") REFERENCES "publicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacion" ADD CONSTRAINT "reclamacion_id_reclamante_fkey" FOREIGN KEY ("id_reclamante") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_id_reclamacion_fkey" FOREIGN KEY ("id_reclamacion") REFERENCES "reclamacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_id_emisor_fkey" FOREIGN KEY ("id_emisor") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_id_reclamacion_fkey" FOREIGN KEY ("id_reclamacion") REFERENCES "reclamacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_id_publicacion_fkey" FOREIGN KEY ("id_publicacion") REFERENCES "publicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_id_reportante_fkey" FOREIGN KEY ("id_reportante") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_id_moderador_fkey" FOREIGN KEY ("id_moderador") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- [MANUAL] Lo que Prisma no sabe expresar en schema.prisma (CLAUDE.md §5.5).
-- Copiado de los scripts de la Fase A (docs/sql/), que ya se probaron.
-- =====================================================================

-- ---- CHECK: Prisma no tiene sintaxis para restricciones CHECK -----------
ALTER TABLE "usuario"
    ADD CONSTRAINT "chk_usuario_correo_dominio"
        CHECK ("correo" IS NULL OR "correo" ~* '^[^@\s]+@udistrital\.edu\.co$'),
    ADD CONSTRAINT "chk_usuario_datos_si_activa"
        CHECK ("estado_cuenta" = 'ELIMINADA'
               OR ("nombre" IS NOT NULL AND "correo" IS NOT NULL AND "hash_contrasena" IS NOT NULL)),
    ADD CONSTRAINT "chk_usuario_intentos" CHECK ("intentos_fallidos" >= 0);

ALTER TABLE "token_usuario"
    ADD CONSTRAINT "chk_token_hash"   CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "chk_token_expira" CHECK ("expira_en" > "creado_en"),
    ADD CONSTRAINT "chk_token_usado"  CHECK ("usado_en" IS NULL OR "usado_en" >= "creado_en");

ALTER TABLE "publicacion"
    ADD CONSTRAINT "chk_publicacion_titulo_largo" CHECK (char_length(btrim("titulo")) BETWEEN 5 AND 100),
    ADD CONSTRAINT "chk_publicacion_fecha_suceso" CHECK ("fecha_suceso" <= "fecha_creacion");

ALTER TABLE "detalle_reservado"
    ADD CONSTRAINT "chk_detalle_texto" CHECK (char_length(btrim("texto")) >= 3);

ALTER TABLE "imagen"
    ADD CONSTRAINT "chk_imagen_orden" CHECK ("orden" BETWEEN 1 AND 5);

ALTER TABLE "historial_estado"
    ADD CONSTRAINT "chk_historial_cambio_real" CHECK ("estado_anterior" IS DISTINCT FROM "estado_nuevo");

ALTER TABLE "reclamacion"
    ADD CONSTRAINT "chk_reclamacion_respuesta"  CHECK (char_length(btrim("respuesta_detalle")) >= 3),
    ADD CONSTRAINT "chk_reclamacion_resolucion" CHECK (("estado" = 'PENDIENTE') = ("fecha_resolucion" IS NULL)),
    ADD CONSTRAINT "chk_reclamacion_fechas"     CHECK ("fecha_resolucion" IS NULL OR "fecha_resolucion" >= "fecha");

ALTER TABLE "mensaje"
    ADD CONSTRAINT "chk_mensaje_contenido" CHECK (char_length(btrim("contenido")) BETWEEN 1 AND 2000);

ALTER TABLE "entrega"
    ADD CONSTRAINT "chk_entrega_doble_confirmacion"
        CHECK (("confirmo_autor" AND "confirmo_reclamante") = ("fecha_entrega" IS NOT NULL));

ALTER TABLE "notificacion"
    ADD CONSTRAINT "chk_notificacion_mensaje" CHECK (char_length(btrim("mensaje")) > 0);

ALTER TABLE "reporte"
    ADD CONSTRAINT "chk_reporte_motivo" CHECK (char_length(btrim("motivo")) >= 5),
    ADD CONSTRAINT "chk_reporte_resolucion"
        CHECK ((("estado" = 'PENDIENTE') = ("id_moderador" IS NULL AND "fecha_resolucion" IS NULL))
           AND (("id_moderador" IS NULL) = ("fecha_resolucion" IS NULL))),
    ADD CONSTRAINT "chk_reporte_fechas" CHECK ("fecha_resolucion" IS NULL OR "fecha_resolucion" >= "fecha");

-- ---- Índices que Prisma no sabe declarar --------------------------------
-- Sobre una EXPRESIÓN (lower(correo)): Prisma solo indexa columnas tal cual.
CREATE UNIQUE INDEX "uq_usuario_correo" ON "usuario" (lower("correo"));
-- GIN sobre un campo Unsupported("tsvector"): Prisma no permite indexar campos Unsupported.
CREATE INDEX "idx_publicacion_busqueda" ON "publicacion" USING GIN ("busqueda");

-- ---- Triggers: Prisma no maneja funciones ni triggers -------------------
-- El detalle reservado solo puede existir en publicaciones ENCONTRADO
-- (un CHECK no puede leer otra tabla; un trigger sí).
CREATE FUNCTION fn_detalle_solo_encontrado() RETURNS trigger AS $$
BEGIN
    IF (SELECT tipo FROM publicacion WHERE id = NEW.id_publicacion) <> 'ENCONTRADO' THEN
        RAISE EXCEPTION 'El detalle reservado solo aplica a publicaciones ENCONTRADO (publicación %)', NEW.id_publicacion;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_detalle_solo_encontrado
    BEFORE INSERT OR UPDATE ON "detalle_reservado"
    FOR EACH ROW EXECUTE FUNCTION fn_detalle_solo_encontrado();

-- La auditoría es inmutable: se cancela todo UPDATE, DELETE y TRUNCATE.
CREATE FUNCTION fn_auditoria_inmutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La tabla auditoria es inmutable: no se permite %', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_inmutable
    BEFORE UPDATE OR DELETE ON "auditoria"
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_inmutable();

CREATE TRIGGER trg_auditoria_sin_truncate
    BEFORE TRUNCATE ON "auditoria"
    FOR EACH STATEMENT EXECUTE FUNCTION fn_auditoria_inmutable();
