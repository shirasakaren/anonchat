# Anonchat on Scaleway

Scaleway's "Serverless Containers" product is NOT a good fit — it defaults
to a 300s request timeout and can scale across multiple instances, which
would break Anonchat's single-instance WebSocket state model. This template
uses Scaleway Instances (real VMs, persistent local storage) instead.

Template: [`main.tf`](./main.tf). Terraform provider: `scaleway/scaleway`
(official). Pulumi: community `@pulumiverse/scaleway`.

## Prerequisites

- A Scaleway account ([scaleway.com](https://www.scaleway.com))
- [Scaleway credentials](https://console.scaleway.com/project/credentials)

## Deploy

```bash
cd deploy/scaleway
terraform init
terraform plan \
  -var="repo_url=https://github.com/<owner>/<repo>.git" \
  -var="postgres_password=$(openssl rand -base64 24 | tr -d '=+/')" \
  -var="session_secret=$(openssl rand -hex 32)"
terraform apply -var="..." -var="..."
```

The flexible IP is allocated before the server — PUBLIC_URL is known in the
same apply. Visit `http://<ip>` to hit the admin setup wizard.

## Updating after a code change

SSH in and run `cd /opt/anonchat/src && git pull && docker compose up -d --build`.

## Why a single VM

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").

## Costs

A `DEV1-M` instance and a flexible IP are billable Scaleway resources.
Review Scaleway's current [pricing](https://www.scaleway.com/en/pricing/) before applying.
