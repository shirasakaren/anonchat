# Anonchat on Coolify

Coolify is a self-hosted, open-source PaaS UI (Heroku/Vercel alternative) that
runs on any VPS. It can directly consume a Docker Compose file from a git repo
as a "Docker Compose" resource type — [`docker-compose.coolify.yml`](../../docker-compose.coolify.yml)
at this repo root adapts the original `docker-compose.yml` for Coolify's
Traefik reverse-proxy conventions with three deliberate changes, each explained
below.

No Terraform or Pulumi provider exists for Coolify (it's a self-hosted UI/API
with no known public IaC provider). Its own compose-file-as-config is the
practical infrastructure-as-code here.

## Prerequisites

- A VPS with Coolify installed (one-line: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`)
- This repo pushed to a GitHub repository
- In Coolify's dashboard, add a new project and create a "Docker Compose"
  resource pointing at this repo (Coolify auto-detects the compose file)

## Three changes from the original docker-compose.yml

1. **`ports` → `expose` + `SERVICE_FQDN_APP_3000`.** The root compose file
   binds port 3000 on the host directly. Coolify runs its own Traefik reverse
   proxy and manages TLS/domain routing — so this variant tells the `app`
   service to only `expose` 3000 internally, and Coolify fills in
   `SERVICE_FQDN_APP_3000` at deploy time (the empty value signals
   "auto-assign a subdomain/domain").

2. **No more `.env`-sourced secrets.** Coolify has its own "magic" variable
   syntax (`SERVICE_BASE64_64_SESSION`, `SERVICE_PASSWORD_POSTGRES`) that
   auto-generates random secrets once and persists them across redeploys,
   surfaced in its dashboard. No need to run `scripts/setup.sh`'s interactive
   generator.

3. **The `minio` profile service is removed.** Coolify's compose parser
   doesn't reliably respect Docker Compose `profiles:` (confirmed open
   upstream bug), so the optional MinIO service from the root compose file
   would be unconditionally started. If you need S3-compatible attachment
   storage on Coolify, use an external provider (Cloudflare R2, AWS S3,
   Backblaze B2) and set the `S3_*` env vars in the `app` service.

Everything else — `build: .` context, named volumes, the `depends_on` graph,
the `healthcheck:` blocks — carries over unchanged from the original.

## Deploy

1. In Coolify, create a "Docker Compose" resource pointing at this repo.
2. Select `docker-compose.coolify.yml` (or let Coolify auto-detect it — it
   looks for compose files at the repo root).
3. Set the `PUBLIC_URL` environment variable to your domain (Coolify will
   auto-generate one via `SERVICE_FQDN_APP_3000` — use that in the
   `PUBLIC_URL` value).
4. Deploy!

Visit your domain to hit the first-run admin setup wizard.

## Updating after a code change

Redeploy in Coolify's dashboard. It pulls the latest commit, rebuilds, and
`docker-entrypoint.sh` runs `prisma migrate deploy` automatically.

## Costs

Coolify itself is free and open source — you pay only for your VPS.
