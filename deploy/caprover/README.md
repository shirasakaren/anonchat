# Anonchat on CapRover

CapRover is a self-hosted, open-source PaaS (Docker Swarm-based) that runs
on any VPS. It has first-class Dockerfile-build support, a WebSocket toggle
(no manual nginx editing needed), a one-click PostgreSQL app, and persistent
directory support that automatically pins the app to a single Swarm node —
matching Anonchat's single-instance architecture perfectly.

No Terraform or Pulumi provider exists for CapRover itself (the only
Terraform-adjacent project found provisions a VPS _running_ CapRover, not
apps _inside_ an existing instance). The [`captain-definition`](../../captain-definition)
file at the repo root is CapRover's only required in-repo config.

## Prerequisites

- A VPS with CapRover installed (one-line: `curl -fsSL https://get.caprover.com | bash`)
- This repo pushed to a GitHub repository CapRover can reach
- The `captain-definition` file at this repo's root already exists — CapRover
  auto-detects it on deploy

## Deploy

1. In CapRover's dashboard, create a new app (e.g. "anonchat") and deploy it:
   point CapRover at this repo (the `captain-definition` file tells it to
   build the root `Dockerfile`).

2. **Enable WebSocket support** — in the app's HTTP Settings, toggle
   "Websocket Support" ON. CapRover handles the nginx proxying (Upgrade/
   Connection headers, proxy_buffering off) automatically — unlike Dokku,
   no manual nginx template editing is needed.

3. **Attach persistent storage** — in the app's "Persistent Directories"
   section, add a mapping: `/app/data/uploads` to a CapRover-managed volume.
   CapRover pins apps with persistent storage to a single Swarm node, which
   also enforces the single-instance invariant Anonchat's WebSocket hub needs.

4. **Provision PostgreSQL** — from the CapRover dashboard, go to the
   one-click apps library and deploy the PostgreSQL app (set version to
   `17-alpine`; the shipped default is older). Internally the database is
   reachable at `srv-captain--<pg-app-name>:5432`. Set `DATABASE_URL` as an
   environment variable in the Anonchat app accordingly, plus `SESSION_SECRET`
   (generate one: `openssl rand -hex 32`) and `PUBLIC_URL`.

5. Redeploy the Anonchat app so it picks up the new environment variables.

Visit your domain — you'll land on the first-run admin setup wizard.

## Updating after a code change

In CapRover's dashboard, hit "Deploy" on the app. CapRover pulls the
latest commit, rebuilds the Docker image, and redeploys. Migrations run
automatically via `docker-entrypoint.sh` before the server binds its port.

## Costs

CapRover itself is free and open source — you pay only for your VPS.
