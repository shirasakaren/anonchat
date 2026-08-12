# Anonchat on Dokku

Dokku is a self-hosted, open-source git-push PaaS — the leanest "git push
and it deploys" option, running on any VPS. Two root-level files support
this: [`CHECKS`](../../CHECKS) (zero-downtime deploy health check) and
[`nginx.conf.sigil`](../../nginx.conf.sigil) (WebSocket proxying override for
Dokku's default nginx vhost template — Dokku's default config does NOT handle
WebSocket Upgrade/Connection headers out of the box, and its default 60s
timeouts can drop idle connections; this override fixes both).

Terraform support exists via the community provider `aliksend/dokku`
(provisions the app + Postgres addon declaratively _against an existing Dokku
host_ — it does not provision the host itself). No Pulumi provider exists;
the Pulumi program bridges the same Terraform provider.

## Prerequisites

- A VPS with Dokku installed (`curl -fsSL https://get.dokku.com | bash`)
- Dokku's Postgres plugin:
  ```bash
  sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git postgres
  ```
- This repo pushed to a GitHub repository (or accessible via git remote on the
  Dokku host)

## CLI setup (one-time per app)

```bash
# On the Dokku host:
dokku apps:create anonchat
dokku postgres:create anonchat-db
dokku postgres:link anonchat-db anonchat          # auto-injects DATABASE_URL

# Persistent uploads storage
sudo mkdir -p /var/lib/dokku/data/storage/anonchat-uploads
dokku storage:mount anonchat /var/lib/dokku/data/storage/anonchat-uploads:/app/data/uploads

# Secrets
dokku config:set anonchat SESSION_SECRET="$(openssl rand -hex 32)"
dokku config:set anonchat PUBLIC_URL="https://anonchat.<your-domain>"

# Pin to exactly one web process (default is already 1, explicit is safer)
dokku ps:scale anonchat web=1
```

### Why one web process (and only one)

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").
Dokku defaults the `web` process type to 1 instance on first deploy, and
`dokku ps:scale anonchat web=1` locks it there explicitly. Never raise this.

## Deploy

```bash
git remote add dokku ssh://dokku@<your-host>:22/anonchat
git push dokku main
```

Dokku auto-selects the Dockerfile builder (since a `Dockerfile` exists at
the repo root, no Herokuish/buildpack detection is triggered). The `CHECKS`
file tells Dokku to wait 60s before the first health check on `/health`
(plenty of headroom for `prisma migrate deploy` on first boot), then up to
30 attempts at 5s intervals — if the server isn't healthy after that window,
Dokku rolls back the deploy.

### WebSocket proxying

[`nginx.conf.sigil`](../../nginx.conf.sigil) overrides Dokku's default nginx
vhost. Without it, Dokku's proxy does NOT send `Upgrade`/`Connection: upgrade`
headers, keeps `proxy_buffering` on, and has 60s timeouts on all three
`proxy_*_timeout` directives — enough to drop idle WebSocket connections.
This file adds `proxy_http_version 1.1`, the WebSocket headers,
`proxy_buffering off`, and raises all timeouts to 3600s. It is inert on every
other platform (Dokku is the only one that reads Sigil-format nginx templates).

## Terraform

[`main.tf`](./main.tf) provisions the same app + Postgres + storage setup
declaratively via `aliksend/dokku`, driven over SSH to an existing Dokku
host. It does NOT provision a VPS — pair it with one of this project's VPS
templates (e.g. [`deploy/hetzner/`](../hetzner/)) to provision the host first,
install Dokku's own one-line install script, then apply this module against
that host over SSH.

Validate: `terraform init -backend=false && terraform validate` from
`deploy/dokku/`.

## Pulumi

The Pulumi program at [`pulumi/`](./pulumi/) bridges the `aliksend/dokku`
Terraform provider (no native Pulumi package exists). Wire credentials
via `pulumi config`.

## Updating after a code change

```bash
git push dokku main
```

Dokku rebuilds and redeploys with zero downtime (the `CHECKS` file gates
traffic cutover until the new container passes its health check). Migrations
run automatically via `docker-entrypoint.sh`.

## Costs

Dokku itself is free and open source — you pay only for your VPS.
