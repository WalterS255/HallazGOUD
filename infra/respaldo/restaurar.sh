#!/usr/bin/env bash
# Restaura un respaldo en una base de datos NUEVA (por defecto hallazgo_restaurada),
# para comprobar que el respaldo sirve sin tocar la base real.
#
#   bash infra/respaldo/restaurar.sh respaldos/hallazgo_ud_20261025_030000.dump
#   bash infra/respaldo/restaurar.sh <archivo> <bd_destino>
#
# Para restaurar ENCIMA de hallazgo_ud (recuperación real tras un desastre) hay que
# pasar su nombre a propósito como segundo argumento: el script lo pide confirmar.
set -euo pipefail

archivo="${1:?Uso: restaurar.sh <archivo.dump> [bd_destino]}"
destino="${2:-hallazgo_restaurada}"

raiz="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$raiz"
# En el servidor: ARCHIVO_ENV=.env.prod (trae COMPOSE_FILE=docker-compose.prod.yml, así que
# docker compose apunta al stack de producción). En desarrollo, el .env de siempre.
archivo_env="${ARCHIVO_ENV:-.env}"
set -a; . "./$archivo_env"; set +a

if [ "$destino" = "$POSTGRES_DB" ]; then
  read -r -p "Vas a REEMPLAZAR $destino con $archivo. Escribe el nombre de la base para confirmar: " ok
  [ "$ok" = "$destino" ] || { echo "Cancelado."; exit 1; }
fi

psql_admin() { docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_admin -c "DROP DATABASE IF EXISTS \"$destino\" WITH (FORCE)"
psql_admin -c "CREATE DATABASE \"$destino\""

docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$destino" --no-owner --exit-on-error < "$archivo"

echo "Restaurado en $destino. Filas por tabla:"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$destino" -tA -F' ' -c "
  SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname" | sed 's/^/  /'
