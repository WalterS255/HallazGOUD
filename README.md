# HallazGO UD

> **"Lo que se pierde en la U, en la U aparece"**

Plataforma web de objetos perdidos y encontrados para la Universidad Distrital Francisco José de Caldas. Quien encuentra un objeto lo publica con un **detalle reservado**; quien lo perdió lo reclama describiendo ese detalle, conversa por un chat interno (sin exponer correo ni teléfono) y la entrega se cierra con **doble confirmación**.

- Alcance, reglas de negocio y decisiones técnicas: [`CLAUDE.md`](CLAUDE.md)
- Propuesta técnica original: [`docs/propuesta/Aplicacion_Web.pdf`](docs/propuesta/Aplicacion_Web.pdf)

> **Estado:** en desarrollo. Ya existen la infraestructura local (Docker) y el backend mínimo (`GET /api/salud`). El modelo de datos con Prisma (Fase C) está en curso. Ver el plan de trabajo en la sección 9 de `CLAUDE.md`.

## Tecnologías

| Parte | Tecnología |
|---|---|
| Backend | NestJS 12 + TypeScript sobre Node.js 24 LTS |
| Base de datos | PostgreSQL 18 (Prisma como ORM) |
| Imágenes | SeaweedFS (API compatible con S3) |
| Correo en desarrollo | Mailpit |
| Pruebas / calidad | Vitest + Supertest · oxlint + Prettier · husky + lint-staged |
| Frontend *(pendiente)* | React + Vite + Tailwind CSS |

## Requisitos

- **Node.js 24 LTS** (`node --version` → `v24.x`, `npm --version` → `11.x`)
- **Docker Desktop** encendido (`docker compose version`)
- **Git**

## Cómo levantarlo por primera vez

```bash
# 1. Variables de entorno: copia la plantilla y cambia las contraseñas y llaves
cp .env.example .env

# 2. Herramientas de Git (activa el control de cada commit)
npm install

# 3. Servicios de apoyo: base de datos, almacenamiento de imágenes y correo
docker compose up -d
docker compose ps          # los tres deben decir "Up"

# 4. Backend
cd backend
npm install
npm run start:dev          # se reinicia solo al guardar un archivo
```

Comprueba que responde:

```bash
curl http://localhost:3000/api/salud
# {"ok":true}
```

> **¿Ya tienes PostgreSQL instalado en Windows?** Usa el puerto 5432, así que el contenedor no podrá arrancar ("ports are not available"). En tu `.env` pon `POSTGRES_PORT=5433` y el mismo puerto en `DATABASE_URL`.

## Servicios locales

Todos escuchan solo en `127.0.0.1`: no se ven desde otras máquinas de la red.

| Servicio | Dirección | Para qué |
|---|---|---|
| API (backend) | http://localhost:3000/api | La aplicación |
| PostgreSQL | `localhost:5432` (o `5433`) | Base de datos |
| SeaweedFS · S3 | http://localhost:8333 | Donde el backend guarda las imágenes |
| SeaweedFS · explorador | http://localhost:8888 | Ver los archivos guardados (sin contraseña: solo en local) |
| Mailpit | http://localhost:8025 | Ver los correos que "envía" la app, sin que salgan a Internet |

## Comandos del backend

Se ejecutan dentro de `backend/`.

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Arranca en modo desarrollo |
| `npm test` | Pruebas unitarias (`*.spec.ts`) |
| `npm run test:e2e` | Pruebas de punta a punta (`test/*.e2e-spec.ts`) |
| `npm run test:cov` | Pruebas con reporte de cobertura |
| `npm run lint` | Lint completo, revisando tipos (~20 s) |
| `npm run format` | Formatea todo con Prettier |
| `npm run build` | Compila TypeScript a `dist/` |

## Control de cada commit

Antes de cada `git commit`, husky ejecuta **Prettier** (formatea) y **oxlint** (busca errores comunes) sobre los archivos `.ts` que vas a guardar. Si oxlint encuentra algo, **el commit no se hace** y la terminal dice qué corregir. No uses `--no-verify` para saltarlo: si el control molesta, es mejor ajustarlo.

## Estructura

```
├── CLAUDE.md            ← contexto completo del proyecto
├── docker-compose.yml   ← db, s3 (SeaweedFS) y mailpit
├── .env.example         ← plantilla de variables (el .env real NO se sube)
├── docs/
│   ├── propuesta/       ← propuesta técnica
│   └── sql/             ← modelo de datos en SQL puro (aprendizaje, Fase A)
└── backend/
    ├── src/
    │   ├── modules/     ← un módulo de Nest por funcionalidad (salud, auth, publicaciones…)
    │   ├── comun/       ← errores, logger, guards, pipes
    │   └── config/      ← lectura de variables de entorno
    └── test/            ← pruebas e2e
```

## Practicar con los scripts SQL

Los scripts de `docs/sql/` crean el modelo completo con datos de prueba. Sirven para aprender y experimentar, **no** son la base de datos de la aplicación (esa la crean las migraciones de Prisma).

Usa una base de datos **aparte**, `hallazgo_practica`: los scripts **borran y vuelven a crear** tablas con los mismos nombres que usa la app, así que ejecutarlos sobre `hallazgo_ud` destruiría sus datos.

```bash
docker compose exec db createdb -U hallazgo hallazgo_practica      # solo la primera vez
docker compose exec db psql -U hallazgo -d hallazgo_practica -f /sql/01_tablas_base.sql
docker compose exec db psql -U hallazgo -d hallazgo_practica -f /sql/02_reclamaciones.sql
```
