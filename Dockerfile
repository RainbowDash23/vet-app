# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------
# Etapa 1: Build y compilación (multi-stage)
# ------------------------------------------------------------------------------
FROM node:22-slim AS builder

WORKDIR /app

# Instalar OpenSSL requerido por los binarios del motor de Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Activar pnpm en la versión exacta fijada en package.json (11.15.1)
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

# Copiar manifiestos y archivos de configuración del workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Instalar todas las dependencias para construcción
RUN pnpm install --frozen-lockfile

# Copiar código fuente necesario
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

# Compilar tipos compartidos
RUN pnpm --filter @vet-app/shared-types build

# Generar cliente de Prisma para la etapa de compilación
RUN pnpm --filter @vet-app/api prisma:generate

# Compilar NestJS API
RUN pnpm --filter @vet-app/api build

# Despliegue podado de dependencias de producción para apps/api
RUN pnpm --filter @vet-app/api --prod --legacy deploy /app/deploy

# Copiar esquema de Prisma al despliegue podado y regenerar el cliente en producción
COPY apps/api/prisma /app/deploy/prisma
RUN cd /app/deploy && ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma

# ------------------------------------------------------------------------------
# Etapa 2: Imagen final de ejecución para producción (mínima y no-root)
# ------------------------------------------------------------------------------
FROM node:22-slim AS runner

WORKDIR /app

# Instalar OpenSSL para el motor de runtime de Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV PATH="/app/node_modules/.bin:$PATH"

# Copiar artefactos podados de producción y compilados
COPY --from=builder --chown=node:node /app/deploy /app
COPY --from=builder --chown=node:node /app/apps/api/dist /app/dist

# Ejecutar como usuario no root 'node' por seguridad
USER node

EXPOSE 3000

# Comando de arranque: ejecutar migraciones pendientes y luego iniciar la API
CMD ["sh", "-c", "prisma migrate deploy && node dist/main.js"]
