# Prueba de carga con k6 (RNF-01)

RNF-01: *el listado filtrado responde en menos de 2 s con 10.000 publicaciones y 200 usuarios a la vez.*

| Archivo | Qué es |
|---|---|
| `datos.sql` | 10.000 publicaciones, 200 usuarios, 8 categorías, 8 sedes y 40 lugares |
| `preparar-bd.sh` | Borra y crea **solo** `hallazgo_carga` (el nombre va fijo), aplica las migraciones y carga los datos |
| `listado.js` | El guion de k6: 200 estudiantes virtuales que abren el catálogo, filtran, buscan, pasan de página y abren fichas, pensando 1-3 s entre clics |

## Cómo correrla (desde la raíz del repositorio)

```bash
bash infra/carga/preparar-bd.sh
```

En otra terminal, un backend **compilado** contra esa base, en el puerto 3100, sin límite de peticiones (200 usuarios simulados desde un PC son UNA sola IP: el límite los frenaría). `SIN_LIMITE_PETICIONES` **no arranca en producción**.

```bash
cd backend && npm run build && DATABASE_URL=postgresql://<usuario>:<clave>@localhost:5433/hallazgo_carga PUERTO=3100 SIN_LIMITE_PETICIONES=true NIVEL_LOG=warn node dist/main.js
```

Usa el mismo usuario y clave de `DATABASE_URL` del `.env`, cambiando solo el nombre de la base. Las variables del comando ganan sobre las del `.env`: para comprobarlo, `curl localhost:3100/api/publicaciones?limite=1` debe decir `"total":7000`.

Después, k6 en Docker (no se instala nada en Windows):

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/infra/carga:/scripts" grafana/k6:2.3.0 run /scripts/listado.js
```

(`pwd -W` y `MSYS_NO_PATHCONV=1` son para Git Bash en Windows; en Linux o macOS usa `$(pwd)` sin la variable.)

## Resultado (2026-11-21)

| Medida | Resultado | Exigido |
|---|---|---|
| p95 del listado | **19,9 ms** | < 2.000 ms |
| Respuesta más lenta | 74,7 ms | — |
| Errores | 0 de 9.224 peticiones | < 1 % |
| Comprobaciones | 17.589 de 17.589 | > 99 % |

**p95** = el 95 % de las respuestas tardó menos que eso. Es mejor medida que el promedio, porque el promedio esconde a los usuarios que esperaron mucho.

**Lo que esta prueba NO mide:** el frontend (va directo a la API, sin pasar por Next) ni la red de la universidad. Es la capacidad del backend y de la base, en el PC de desarrollo.
