# Anonchat on Vultr

Vultr is IaaS with an optional managed PostgreSQL addon. This template
provisions a single VM bootstrapped via cloud-init to run the full stack
(self-hosted PostgreSQL via the compose file, plus the app). A reserved IP
is allocated before the instance so `PUBLIC_URL` is known in one apply —
no two-step dance.

Template: [`main.tf`](./main.tf). Terraform provider: `vultr/vultr` (official).
Pulumi: community-only `@pulumiverse/vultr` — note the maturity gap in the README.

## Prerequisites

- A Vultr account ([vultr.com](https://www.vultr.com))
- A [Vultr API key](https://my.vultr.com/settings/#settingsapi)

## Deploy

```bash
cd deploy/vultr
terraform init
terraform plan \
  -var="repo_url=https://github.com/<owner>/<repo>.git" \
  -var="postgres_password=$(openssl rand -base64 24 | tr -d '=+/')" \
  -var="session_secret=$(openssl rand -hex 32)"
terraform apply -var="..." -var="..."
```

Visit `http://<reserved-ip>` — you'll land on the first-run admin setup wizard.

## Updating after a code change

SSH into the VM:
```bash
cd /opt/anonchat/src && git pull && docker compose up -d --build
```

## Storage note

The compose Postgres container and uploads volume both live on the VM's own
local SSD (persistent, not ephemeral like a PaaS container). No separate block
storage volume is provisioned — you can add a `vultr_block_storage` resource
(attaches directly, no separate attachment resource needed on Vultr) if you
want to grow uploads beyond the base plan disk.

## Why a single VM

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").
This template provisions exactly one instance — the right number.

## Costs

A `vc2-2c-4gb` instance and a reserved IP are billable Vultr resources.
Review Vultr's current [pricing](https://www.vultr.com/pricing/) before applying.
