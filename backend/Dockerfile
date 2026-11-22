# Imagen de producción del backend (Fase K). Varias etapas: las herramientas de
# compilación se quedan en las primeras; la imagen final solo lleva lo necesario.
#
#   docker build -t hallazgo-backend .                     → la API
#   docker build -t hallazgo-migrar --target migrar .      → aplica las migraciones y sale
#
# Node 24 LTS (CLAUDE.md §4), "slim" (Debian): sharp trae binarios listos para glibc.
ARG NODE=node:24.22.1-bookworm-slim

# ---- 1) Dependencias completas (con las de desarrollo: Nest CLI, prisma, TypeScript)
FROM ${NODE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# El postinstall ejecuta `prisma generate`, que necesita el schema y su configuración.
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma.config.ts exige DATABASE_URL aunque `generate` NO se conecta a la base. Se pasa
# una de relleno SOLO a este comando (no queda guardada en la imagen como ENV).
RUN DATABASE_URL="postgresql://compilacion@localhost:5432/no-se-usa" npm ci

# ---- 2) Compilar TypeScript a dist/ (incluye el cliente de Prisma generado)
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- 3) Migraciones: usa la CLI de prisma (dependencia de desarrollo) y termina.
#      Se conecta como el DUEÑO de las tablas (DATABASE_URL_MIGRACIONES), nunca como
#      hallazgo_app, que no puede cambiar la estructura (infra/bd/roles.sql).
FROM deps AS migrar
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- 4) Solo lo de producción
FROM ${NODE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: el postinstall (prisma generate) no hace falta; el cliente ya está
# compilado en dist/. sharp trae su binario como dependencia opcional, sin scripts.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- 5) Imagen final
FROM ${NODE}
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Sin privilegios de root: si alguien lograra ejecutar código, no sería administrador
# del contenedor. El usuario "node" ya viene en la imagen oficial.
USER node
EXPOSE 3000
# Docker revisa que la API responda; /api/salud no toca la base ni tiene rate limit.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PUERTO||3000)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
