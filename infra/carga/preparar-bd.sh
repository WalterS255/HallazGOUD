#!/usr/bin/env bash
# Crea (o recrea) la base de la prueba de carga: hallazgo_carga, con 10.000 publicaciones.
# Uso, desde la raíz del repositorio:   bash infra/carga/preparar-bd.sh
#
# SOLO toca hallazgo_carga: el nombre está fijo aquí y nunca sale del .env, así este
# script no puede borrar hallazgo_ud por error.
set -euo pipefail
cd "$(dirname "$0")/../.."

BD=hallazgo_carga
set -a; source .env; set +a
URL_CARGA="${DATABASE_URL%/*}/$BD"   # misma URL que el .env, cambiando solo el nombre de la base

echo "→ Borrando y creando $BD (solo esa base)…"
docker compose exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$BD"
docker compose exec -T db createdb -U "$POSTGRES_USER" "$BD"

echo "→ Aplicando las migraciones de Prisma…"
(cd backend && DATABASE_URL="$URL_CARGA" npx prisma migrate deploy >/dev/null)

echo "→ Cargando 10.000 publicaciones y 200 usuarios…"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$BD" -v ON_ERROR_STOP=1 -q < infra/carga/datos.sql

echo "✓ $BD lista."
