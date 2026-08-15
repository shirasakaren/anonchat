#!/bin/sh
set -e

# The image runs as root so this entrypoint can fix volume ownership before
# dropping privileges: Railway and other PaaS bind mounts arrive root-owned,
# which would leave the non-root app unable to write uploads (EACCES on
# mkdir). Docker named volumes initialize from the image layer already
# owned by the app user, so the chown is skipped when nothing is wrong.
if [ -d /app/data/uploads ] && [ "$(stat -c %u /app/data/uploads 2>/dev/null || echo 1001)" != "1001" ]; then
  echo "Fixing uploads volume ownership..."
  chown -R anonchat:anonchat /app/data/uploads
fi

echo "Running database migrations..."
su-exec anonchat node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

exec su-exec anonchat "$@"
