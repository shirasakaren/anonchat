# Anonchat on Hetzner Cloud

Hetzner is pure IaaS — no managed Kubernetes, no App Platform, and critically
**no managed PostgreSQL product at all**. This template provisions a single VM
bootstraped via cloud-init to run `docker compose up -d --build` (the same
`docker-compose.yml` any self-hosted install uses, which starts its own
PostgreSQL container alongside the app). The VM's root SSD is persistent
local storage — no separate block volume is needed for the compose volumes.

Template: [`main.tf`](./main.tf)

## Prerequisites

- A Hetzner Cloud account ([hetzner.com/cloud](https://www.hetzner.com/cloud))
- A [Hetzner API token](https://docs.hetzner.com/cloud/api/getting-started/generating-api-token/)

## Deploy

```bash
cd deploy/hetzner
terraform init
terraform plan \
  -var="repo_url=https://github.com/<owner>/<repo>.git" \
  -var="postgres_password=$(openssl rand -base64 24 | tr -d '=+/')" \
  -var="session_secret=$(openssl rand -hex 32)"
```

Review the plan — it creates a `cx22` or larger server (2 vCPU, 4GB RAM for
the on-VM Docker build), a floating IP, and optionally an additional volume,
all real and billable. Then apply with the same variables:

```bash
terraform apply -var="repo_url=..." -var="postgres_password=..." -var="session_secret=..."
```

The floating IP is allocated before the server and referenced in `PUBLIC_URL`
in the same apply — no two-step PUBLIC_URL dance is needed, unlike the cloud
PaaS templates.

## Updating after a code change

SSH into the VM and run:

```bash
cd /opt/anonchat/src && git pull && docker compose up -d --build
```

Or re-apply Terraform with a version tag in `repo_branch` for immutability
(changing `user_data` forces server replacement — be aware of this).

`docker-entrypoint.sh` runs `prisma migrate deploy` automatically before the
server binds its port.

## Why a single VM (and only one)

The WebSocket hub keeps all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").
This template provisions exactly one server — the right number for this app.

## Costs

A `cx22` server costs ~€4/month (plus the floating IP). Hetzner has no
managed Postgres product, so you self-host PostgreSQL on the VM (zero
additional platform cost). Review Hetzner's current [pricing](https://www.hetzner.com/cloud) before applying.
