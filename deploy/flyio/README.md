# Anonchat on Fly.io

Fly.io is one of the best architectural fits for Anonchat: a Fly Machine is
a real Firecracker microVM running your container indefinitely — no execution
time cap, no forced restarts between requests. It holds WebSocket connections
and a normal PostgreSQL connection pool exactly like a bare VM would.

[`fly.toml`](../../fly.toml) at the repo root declares one Machine pinned to
one Fly Volume (attached at `/app/data/uploads` for local-disk uploads), with
auto-stop disabled so idle WebSocket connections aren't dropped.

**No maintained Terraform or Pulumi provider exists for Fly.io.** Fly's
official `terraform-provider-fly` was archived by Fly in 2024 (they've said
Fly's Machines model doesn't map well to a static resource-graph IaC tool,
and they don't plan to revive it). Only stalled community forks exist.
`fly.toml` + `flyctl deploy` IS Fly's own idiomatic infrastructure-as-code
equivalent — see below.

## Prerequisites

- A Fly.io account ([fly.io](https://fly.io))
- [`flyctl`](https://fly.io/docs/flyctl/install/) installed and signed in
  (`flyctl auth signup` or `flyctl auth login`)
- This repo pushed to a GitHub repository (or a local Docker image)

## 1. Deploy

```bash
flyctl launch          # auto-detects fly.toml, prompts for org/region
flyctl deploy          # builds the Docker image and deploys it
```

`flyctl launch` will ask to provision a managed Postgres cluster — say yes
(Fly Managed Postgres, `fly mpg`, is the near-zero-config option) or no (if
you'd rather use the older self-managed `fly postgres create` which is cheaper
but leaves you responsible for HA/backups):

```bash
fly mpg create --name anonchat-db --region ord --pg-version 17
```

## 2. Set secrets and PUBLIC_URL

```bash
fly secrets set SESSION_SECRET="$(openssl rand -hex 32)"
fly secrets set DATABASE_URL="<connection-string-from-mpg>"
```

Grab the assigned `*.fly.dev` domain (or your own), set it in fly.toml's
`[[services]]` block, and `flyctl deploy` again so the app knows its own
public URL in `PUBLIC_URL`.

## 3. Visit your domain

You'll land on the first-run admin setup wizard.

## Updating after a code change

```bash
flyctl deploy
```

Runs the full Docker build + Machine update. Migrations run automatically
via `docker-entrypoint.sh` before the server binds its port.

**CI/CD:** the official `superfly/flyctl-actions` GitHub Action (just a
`flyctl deploy` step authenticated via `FLY_API_TOKEN` secret) works for
push-to-deploy automation.

## Why one Machine (and only one)

The WebSocket hub holds all connection and subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").
This template pins `min_machines_running = 1` with auto-stop disabled. A
Fly Volume also attaches to exactly one Machine, which independently
prevents accidental multi-machine fanout at the storage layer.

## Costs

A Fly Machine, a Fly Volume, and a Fly Managed Postgres cluster are all
billable Fly.io resources. Review Fly's [pricing page](https://fly.io/docs/about/pricing/)
before running `flyctl deploy`.
