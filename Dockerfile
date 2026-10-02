# ---- Stage 1: build (deps + typecheck + bundle) ----
FROM node:24-alpine AS build
WORKDIR /app

# Solo manifests: cache de capa para npm ci (invalida únicamente al tocar
# package.json o el lockfile).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# tsconfig es REQUERIDO por el typecheck (tsc 7 sin config imprime el help
# y aborta) y por esbuild (resolución del proyecto).
COPY tsconfig.json ./
COPY src ./src

# El bundle de esbuild NO valida tipos: el typecheck es la guardia real.
RUN npm run typecheck

# Bundle CJS: el stack de deps del backend es CJS (dotenv, pg, drizzle…), y
# esbuild NO puede embeber sus require dinámicos en un bundle ESM (fallaría
# "Dynamic require of fs is not supported"). En CJS esos require funcionan
# nativamente. Outputs .cjs: el package.json del repo es type:module, la
# extensión .cjs gana esa declaración. Un archivo por proceso (server,
# migraciones, seed opcional); runtime SIN node_modules.
RUN npx esbuild src/index.ts --bundle --platform=node --target=node24 --format=cjs --outfile=out/server.cjs \
 && npx esbuild src/infrastructure/database/migrate.ts --bundle --platform=node --target=node24 --format=cjs --outfile=out/migrate.cjs \
 && npx esbuild src/infrastructure/database/seed-cli.ts --bundle --platform=node --target=node24 --format=cjs --outfile=out/seed.cjs

# ---- Stage 2: runtime (sin devDeps, sin fuente, non-root) ----
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/out ./out
# Migraciones versionadas: las consume out/migrate.js (carpeta ya empaquetada,
# no se vuelve a bundlear).
COPY --from=build /app/src/infrastructure/database/migrations ./migrations
COPY package.json ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

# 1) Migraciones SIEMPRE antes de servir. 2) Seed solo si SEED=true: crea al
# admin con SEED_ADMIN_PASSWORD (obligatoria; FALLA sin ella) y al demo público
# demo@inventory.com/demo1234 (VIEWER). Repetible y no destructivo.
ENTRYPOINT ["sh", "-c", "node out/migrate.cjs && if [ \"$SEED\" = \"true\" ]; then node out/seed.cjs; fi && exec node out/server.cjs"]