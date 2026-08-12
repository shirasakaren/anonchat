#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Anonchat preview launcher — serves the full app on ONE port (3000).
#
# Unlike scripts/dev.sh (hot-reload dev on :5173 + API on :3000), this
# builds the web app and serves it from the Fastify server itself — the
# same layout as the production Docker image. Great for a quick preview.
#
#   ./scripts/preview.sh
#
# Prerequisites handled automatically: Postgres container, deps, migrations.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

DB_CONTAINER="anonchat-postgres"
DB_PORT="${ANONCHAT_DB_PORT:-5432}"
DB_USER="anonchat"
DB_PASSWORD="anonchat"
DB_NAME="anonchat"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"

echo "▶ anonchat preview launcher (single port :3000)"

# ── 1. Postgres ─────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker is required but not found. Install it from https://www.docker.com/"
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
  echo "✓ Postgres container already running"
elif docker ps -a --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
  echo "▶ Starting existing Postgres container..."
  docker start "${DB_CONTAINER}" >/dev/null
else
  echo "▶ Creating Postgres container (port ${DB_PORT})..."
  docker run -d \
    --name "${DB_CONTAINER}" \
    -p "${DB_PORT}:5432" \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
    -e POSTGRES_DB="${DB_NAME}" \
    -v anonchat-postgres-data:/var/lib/postgresql/data \
    postgres:17-alpine >/dev/null
fi

echo "▶ Waiting for Postgres..."
until docker exec "${DB_CONTAINER}" pg_isready -U "${DB_USER}" >/dev/null 2>&1; do
  sleep 1
done
echo "✓ Postgres ready"

# ── 2. Dependencies ─────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "▶ Installing dependencies..."
  pnpm install
fi

# ── 3. Server .env (preview values) ─────────────────────────────────────
ENV_FILE="apps/server/.env"
echo "▶ Ensuring ${ENV_FILE} has preview settings..."
if [ ! -f "${ENV_FILE}" ]; then
  umask 077
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=dev-only-secret-generate-a-real-one-with-openssl-rand-hex-32
PUBLIC_URL=http://localhost:3000
NODE_ENV=development
PORT=3000
EOF
else
  # Update the connection-critical lines in place for this machine
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "${ENV_FILE}" 2>/dev/null || \
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "${ENV_FILE}"
  sed -i '' "s|^PUBLIC_URL=.*|PUBLIC_URL=http://localhost:3000|" "${ENV_FILE}" 2>/dev/null || \
    sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=http://localhost:3000|" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

# ── 4. Migrations ───────────────────────────────────────────────────────
echo "▶ Running database migrations..."
pnpm --filter @anonchat/server run db:generate >/dev/null
pnpm --filter @anonchat/server run db:migrate

# ── 5. Build ────────────────────────────────────────────────────────────
echo "▶ Building web app and server..."
pnpm run build

# ── 6. Serve everything on :3000 ────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────────"
echo "  Preview:    http://localhost:3000"
echo "  API health: http://localhost:3000/health"
echo "──────────────────────────────────────────────────────────"
echo ""
export WEB_DIST_DIR="$(pwd)/apps/web/dist"
export NODE_ENV=production
exec node apps/server/dist/main.js
