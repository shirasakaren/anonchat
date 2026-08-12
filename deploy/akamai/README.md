# Anonchat on Akamai Connected Cloud (Linode)

Akamai Connected Cloud is the new name for Linode's cloud platform. The
underlying Terraform provider is still named `linode/linode` — this template
uses it to provision a single VM bootstrapped via cloud-init (through the
Linode Metadata service) running the full `docker compose` stack with
self-hosted PostgreSQL.

The Metadata service is not enabled in every Akamai/Linode region — the
default `us-east` is confirmed to support it. Pick another supported region
if you deploy elsewhere.

Template: [`main.tf`](./main.tf)

## Prerequisites

- A Linode/Akamai Cloud account ([linode.com](https://www.linode.com))
- A [Linode API token](https://cloud.linode.com/profile/tokens)

## Deploy

```bash
cd deploy/akamai
terraform init
terraform plan \
  -var="repo_url=https://github.com/<owner>/<repo>.git" \
  -var="postgres_password=$(openssl rand -base64 24 | tr -d '=+/')" \
  -var="session_secret=$(openssl rand -hex 32)"
terraform apply -var="..." -var="..."
```

Visit `http://<instance-ip>` — you'll land on the first-run admin setup wizard.

## PUBLIC_URL two-step apply

Unlike the Hetzner/Vultr templates (which allocate a reserved IP before the
server), Akamai assigns the IP *from* the instance — Terraform outputs it as
`ip_address`. Set `PUBLIC_URL` to that IP (or your domain pointing at it) and
re-apply the same way the GCP/AWS/Azure templates do.

## Updating after a code change

SSH into the VM:
```bash
cd /opt/anonchat/src && git pull && docker compose up -d --build
```

## Why a single VM

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").

## Costs

A `g6-standard-2` instance is a billable Linode resource. Review Akamai
Cloud's current [pricing](https://www.linode.com/pricing/) before applying.
