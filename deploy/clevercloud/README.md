# Anonchat on Clever Cloud

Clever Cloud is one of the best architectural fits for this app: create a
"Docker" type application and it builds from this repo's root Dockerfile,
runs it as a persistent process (holds WebSocket connections fine, normal
PostgreSQL pool fine), and has the only **official native Pulumi provider**
(non-Terraform-bridged) found across this entire project.

Terraform: official `CleverCloud/clevercloud`. Pulumi: official native
`CleverCloud/pulumi-clevercloud` (built on the Pulumi Provider Framework).

## Two env vars you MUST set or routing breaks

Clever Cloud's Docker orchestrator defaults to expecting port 8080, and
this app listens on 3000 — **`CC_DOCKER_EXPOSED_HTTP_PORT=3000` is required**
or the reverse proxy routes nowhere. Also set `CC_HEALTH_CHECK_PATH=/health`
to wire deploy-validation health checks to this app's existing endpoint.
Both are easy to miss — set them first.

## Storage: S3 only (FS Buckets not available for Docker apps)

Clever Cloud's persistent-disk mechanism ("FS Buckets") is explicitly
**not available for Docker-type applications** (security restriction,
confirmed from their own docs). `STORAGE_DRIVER=s3` against Clever Cloud's
own S3-compatible object storage addon ("Cellar", EU-hosted, works with any
S3 SDK unmodified) is the only option:

```bash
clever addon create cellar-addon --plan xs
clever service link-app <addon-id>
```

Wire `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/
`S3_FORCE_PATH_STYLE=true` from the linked addon's env vars.

## Prerequisites

- A Clever Cloud account ([clever-cloud.com](https://www.clever-cloud.com))
- [`clever-tools`](https://github.com/CleverCloud/clever-tools) CLI installed

## Deploy

```bash
clever create --type docker anonchat
clever env set CC_DOCKER_EXPOSED_HTTP_PORT 3000
clever env set CC_HEALTH_CHECK_PATH /health
clever addon create postgresql-addon --plan xs
clever service link-app <addon-id>
clever env set SESSION_SECRET "$(openssl rand -hex 32)"
clever deploy
```

After the first deploy, grab the assigned `*.cleverapps.io` domain and set
`PUBLIC_URL` + `DATABASE_URL` from the linked addon's auto-injected
connection string, then `clever deploy` again.

## Updating after a code change

```bash
git push clever main
```

Or connect a GitHub repo for auto-deploy on push. Migrations run
automatically via `docker-entrypoint.sh`.

## Single-instance invariant

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").
Clever Cloud Docker apps are single-process by nature — no scaling concern.

## Costs

A Docker app, a PostgreSQL addon, and a Cellar addon are billable Clever Cloud
resources. Review Clever Cloud's current [pricing](https://www.clever-cloud.com/pricing/) before deploying.
