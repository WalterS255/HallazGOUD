# HallazGO UD

> **"Lo que se pierde en la U, en la U aparece"**

Plataforma web de objetos perdidos y encontrados para la Universidad Distrital Francisco José de Caldas. Quien encuentra un objeto lo publica con un **detalle reservado**; quien lo perdió lo reclama describiendo ese detalle, conversa por un chat interno (sin exponer correo ni teléfono) y la entrega se cierra con **doble confirmación**.

- Alcance, reglas de negocio y decisiones técnicas: [`CLAUDE.md`](CLAUDE.md)
- Propuesta técnica original: [`docs/propuesta/Aplicacion_Web.pdf`](docs/propuesta/Aplicacion_Web.pdf)
- **Documentación técnica:** [`docs/`](docs/README.md): API para el frontend, arquitectura, modelo de datos y pendientes

> **Estado:** el **backend está completo y probado** (todas las funciones de la propuesta). El **frontend** (carpeta [`frontend/`](frontend/README.md)) tiene las pantallas principales conectadas a la API; le faltan tres endpoints del backend ([`frontend/docs/endpoints-pendientes.md`](frontend/docs/endpoints-pendientes.md)). Quedan algunas decisiones de producto y el despliegue: ver [`docs/pendientes.md`](docs/pendientes.md) y la sección 9 de `CLAUDE.md`.

## Estructura del repositorio

```
├── backend/             ← API REST (NestJS + Prisma). Listo y probado.
├── frontend/            ← Aplicación web (Next.js). Empieza aquí: frontend/README.md
├── docs/                ← API, arquitectura, modelo de datos, pendientes, propuesta y SQL de práctica
├── infra/               ← scripts de base de datos (roles, respaldos)
├── docker-compose.yml   ← servicios de apoyo: db (PostgreSQL), s3 (SeaweedFS) y mailpit
├── .env.example         ← plantilla de variables (el .env real NUNCA se sube)
└── CLAUDE.md            ← contexto completo del proyecto (requerimientos, reglas, plan)
```

## Tecnologías

| Parte | Tecnología |
|---|---|
| Backend | NestJS 12 + TypeScript sobre Node.js 24 LTS |
| Base de datos | PostgreSQL 18 (Prisma como ORM) |
| Imágenes | SeaweedFS (API compatible con S3) |
| Correo en desarrollo | Mailpit |
| Pruebas / calidad | Vitest + Supertest · oxlint + Prettier · husky + lint-staged |
| Frontend | **Next.js 15** (App Router) + React 19 + Tailwind CSS 4 + TypeScript, sobre Node.js 24. Habla con la API por un proxy propio (sin CORS) y guarda el JWT en una cookie `httpOnly` |

## Requisitos

- **Node.js 24 LTS** (`node --version` → `v24.x`, `npm --version` → `11.x`)
- **Docker Desktop** encendido (`docker compose version`)
- **Git**

## Cómo levantarlo por primera vez

```bash
# 0. Clonar el repositorio
git clone https://github.com/WalterS255/HallazGOUD.git
cd HallazGOUD

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

Para tener datos de prueba (categorías, sedes, lugares y 3 cuentas, una por rol), con `CONTRASENA_SEED` definida en el `.env`:

```bash
cd backend
npx prisma migrate deploy    # crea las tablas
npm run db:seed              # carga los datos iniciales
```

El frontend se levanta aparte, en otra terminal, con el backend encendido:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:3001
```

Detalles en [`frontend/README.md`](frontend/README.md). Para que los enlaces de los correos abran el frontend, en el `.env` de la raíz pon `URL_FRONTEND=http://localhost:3001`.

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
| Frontend | http://localhost:3001 | La aplicación web. En `/estado`, el diagnóstico de la conexión con la API |

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

## Cómo trabajamos en equipo (ramas y Pull Requests)

Usamos **un solo repositorio** con las dos carpetas (`backend/` y `frontend/`) y **ramas cortas** que se unen a `main` por medio de un *Pull Request* (PR): una propuesta de cambio en GitHub que la otra persona revisa antes de unirla.

- **`main`** es la versión estable: siempre debe arrancar y pasar las pruebas. **Nadie trabaja directo en `main`.**
- Cada tarea va en su propia rama, que sale de `main` y dura días, no meses:
  - `feature/front-<tarea>`, por ejemplo `feature/front-catalogo` o `feature/front-login`;
  - `feature/back-<tarea>`, por ejemplo `feature/back-cancelar-reclamacion`;
  - `fix/<problema>` para arreglos.
- Al terminar la tarea: subir la rama, abrir un PR hacia `main`, que la otra persona lo revise y unirlo. Después se borra la rama.

```bash
git switch main && git pull                  # partir siempre del main más reciente
git switch -c feature/front-catalogo         # rama nueva para la tarea
# …trabajar y hacer commits…
git push -u origin feature/front-catalogo    # subirla
# en GitHub: "Compare & pull request" → revisión → "Merge"
```

**¿Por qué no una rama `backend` y otra `frontend` que se unen al final?** Porque cuanto más tiempo viven separadas, más se alejan, y la unión final se vuelve un choque grande y difícil de revisar. Además, las carpetas ya separan el trabajo: quien hace frontend casi nunca toca `backend/`, así que los conflictos son raros. Con ramas cortas, cada PR es pequeño, se revisa en minutos y `main` siempre tiene el proyecto completo funcionando.

**Mensajes de commit** con la convención semántica: `feat:` (función nueva), `fix:` (arreglo), `docs:`, `test:`, `refactor:`, `chore:`. Por ejemplo: `feat(front): catálogo con filtros y paginación`.

## Control de cada commit

Antes de cada `git commit`, husky ejecuta **Prettier** (formatea) y **oxlint** (busca errores comunes) sobre los archivos `.ts` del backend que vas a guardar. Si oxlint encuentra algo, **el commit no se hace** y la terminal dice qué corregir. No uses `--no-verify` para saltarlo: si el control molesta, es mejor ajustarlo. (Cuando exista el frontend, se le agregará su propio control en `frontend/`.)

## Estructura del backend

```
backend/
├── prisma/          ← schema, migraciones y seed
├── src/
│   ├── modules/     ← un módulo de Nest por funcionalidad (auth, publicaciones, reclamaciones…)
│   ├── comun/       ← errores, logger, guards, pipes
│   ├── lib/         ← prisma, correo, almacenamiento, auditoría, imágenes
│   └── config/      ← lectura y validación de variables de entorno
└── test/            ← pruebas e2e y de base de datos
```
