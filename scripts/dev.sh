#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Anonchat local dev launcher
#
# One command to go from a fresh clone to a running dev environment:
#   ./scripts/dev.sh
#
# - Starts a dedicated Postgres container (anonchat-postgres) if needed
# - Writes apps/server/.env with sane dev defaults if missing
# - Installs dependencies if needed
# - Runs Prisma migrations
# - Starts the server (:3000) and web (:5173) dev servers
#
# Optional: use a different Postgres port by setting ANONCHAT_DB_PORT.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

DB_CONTAINER="anonchat-postgres"
DB_PORT="${ANONCHAT_DB_PORT:-5432}"
DB_USER="anonchat"
DB_PASSWORD="anonchat"
DB_NAME="anonchat"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"

echo "▶ anonchat dev launcher"

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

# Wait for Postgres to accept connections
echo "▶ Waiting for Postgres..."
until docker exec "${DB_CONTAINER}" pg_isready -U "${DB_USER}" >/dev/null 2>&1; do
  sleep 1
done
echo "✓ Postgres ready"

# ── 2. Dependencies ─────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "▶ Installing dependencies..."
  pnpm install
else
  echo "✓ Dependencies already installed"
fi

# ── 3. Server .env ──────────────────────────────────────────────────────
ENV_FILE="apps/server/.env"
if [ ! -f "${ENV_FILE}" ]; then
  echo "▶ Writing ${ENV_FILE} with dev defaults..."
  umask 077
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=dev-only-secret-generate-a-real-one-with-openssl-rand-hex-32
PUBLIC_URL=http://localhost:5173
NODE_ENV=development
PORT=3000
EOF
else
  echo "✓ ${ENV_FILE} exists (not overwriting)"
  chmod 600 "${ENV_FILE}"
fi

# ── 4. Migrations ───────────────────────────────────────────────────────
echo "▶ Running database migrations..."
pnpm --filter @anonchat/server run db:generate >/dev/null
pnpm --filter @anonchat/server run db:migrate

# ── 5. Dev servers ──────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────────"
echo "  Web app:    http://localhost:5173  (hot reload, proxied API)"
echo "  API server: http://localhost:3000  (health: /health)"
echo "──────────────────────────────────────────────────────────"
echo ""
exec pnpm run dev
