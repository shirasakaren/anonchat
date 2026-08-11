# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base: shared setup for all build stages
# ---------------------------------------------------------------------------
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------
# deps: install the full workspace (needed to build every package)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/crypto/package.json packages/crypto/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: compile crypto -> shared -> server (+ prisma client) -> web
# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages packages
COPY apps apps
COPY tsconfig.base.json ./
RUN pnpm --filter @termine/crypto run build \
  && pnpm --filter @termine/shared run build \
  && pnpm --filter @termine/server run db:generate \
  && pnpm --filter @termine/server run build \
  && pnpm --filter @termine/web run build

# ---------------------------------------------------------------------------
# deploy: produce a self-contained, production-only server directory
# (pnpm deploy inlines the workspace: dependencies on @termine/crypto and
# @termine/shared instead of leaving symlinks that wouldn't survive being
# copied into a separate final image layer)
# ---------------------------------------------------------------------------
FROM build AS deploy
RUN pnpm --filter @termine/server --prod deploy /deployed
# pnpm deploy re-resolves node_modules into a fresh virtual store, which
# does not carry over the Prisma Client generated during the build stage -
# regenerate it here so it lands in the deployed node_modules.
RUN cd /deployed && node_modules/.bin/prisma generate --schema=prisma/schema.prisma

# ---------------------------------------------------------------------------
# runtime: minimal final image
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
RUN apk add --no-cache curl \
  && addgroup -g 1001 termine \
  && adduser -D -u 1001 -G termine termine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV WEB_DIST_DIR=/app/web-dist
ENV UPLOAD_DIR=/app/data/uploads

COPY --from=deploy /deployed /app
COPY --from=build /repo/apps/web/dist /app/web-dist
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /app/data/uploads \
  && chown -R termine:termine /app

USER termine
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
