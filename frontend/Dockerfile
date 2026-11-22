# Imagen de producción del frontend (Fase K): Next.js en modo "standalone".
#   docker build -t hallazgo-frontend .
ARG NODE=node:24.22.1-bookworm-slim

# ---- 1) Dependencias
FROM ${NODE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2) Compilar. NODE_ENV=production: la CSP de next.config.ts sale SIN
#      'unsafe-eval' ni websockets (esos son solo para desarrollo).
FROM deps AS build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# ---- 3) Imagen final: el servidor mínimo que genera Next (.next/standalone),
#      más los archivos estáticos, que standalone no copia solo.
FROM ${NODE}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/privacidad').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
