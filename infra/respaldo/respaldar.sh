#!/usr/bin/env bash
# Respaldo de la base de datos (RNF-12: diario, 30 días de retención).
#
#   bash infra/respaldo/respaldar.sh            # respalda POSTGRES_DB (hallazgo_ud)
#   bash infra/respaldo/respaldar.sh otra_bd     # respalda otra base
#
# En el VPS se programa con cron, una vez al día:
#   0 3 * * * cd /ruta/hallazgo && bash infra/respaldo/respaldar.sh >> respaldos/respaldo.log 2>&1
#
# Formato "custom" de pg_dump (-Fc): comprimido y restaurable con pg_restore,
# que permite restaurar tablas sueltas. Los archivos van a respaldos/ (en .gitignore:
# un respaldo tiene datos personales y NUNCA va al repositorio).
set -euo pipefail

raiz="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$raiz"
set -a; . ./.env; set +a

bd="${1:-$POSTGRES_DB}"
dias_retencion="${DIAS_RETENCION_RESPALDO:-30}"
destino="respaldos"
archivo="$destino/${bd}_$(date +%Y%m%d_%H%M%S).dump"
mkdir -p "$destino"

# -T: sin terminal interactiva, para que el archivo binario pase limpio por la tubería.
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$bd" -Fc --no-owner > "$archivo.tmp"
# Se escribe primero en .tmp y luego se renombra: si pg_dump falla a mitad,
# nunca queda un archivo a medias con apariencia de respaldo válido.
mv "$archivo.tmp" "$archivo"

# Un respaldo vacío o diminuto es señal de error: mejor fallar ruidosamente.
tamano=$(wc -c < "$archivo")
if [ "$tamano" -lt 1024 ]; then
  echo "ERROR: el respaldo pesa solo $tamano bytes: $archivo" >&2
  exit 1
fi

# Retención: borra respaldos de esta base con más de N días.
find "$destino" -name "${bd}_*.dump" -type f -mtime +"$dias_retencion" -print -delete

echo "Respaldo listo: $archivo ($(( tamano / 1024 )) KB)"
