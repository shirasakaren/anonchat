# Anonchat on UpCloud

UpCloud is IaaS with an optional managed PostgreSQL addon. This template
provisions a single VM bootstrapped via cloud-init to run the full
`docker compose` stack with self-hosted PostgreSQL.

Template: [`main.tf`](./main.tf). Terraform provider: `UpCloudLtd/upcloud`
(vendor-maintained). Pulumi: vendor-maintained `@upcloudltd/pulumi-upcloud`
(low version number — less battle-tested than other providers' Pulumi packages).

## Prerequisites

- An UpCloud account ([upcloud.com](https://www.upcloud.com))
- [UpCloud API credentials](https://hub.upcloud.com)

## Deploy

```bash
cd deploy/upcloud
terraform init
terraform plan \
  -var="repo_url=https://github.com/<owner>/<repo>.git" \
  -var="postgres_password=$(openssl rand -base64 24 | tr -d '=+/')" \
  -var="session_secret=$(openssl rand -hex 32)"
terraform apply -var="..." -var="..."
```

Use the public IP from `terraform output ip_address` for `PUBLIC_URL` and
re-apply (two-step apply, like the GCP/AWS templates).

## Updating after a code change

SSH into the VM and run `cd /opt/anonchat/src && git pull && docker compose up -d --build`.

## Why a single VM

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").

## Costs

A `2xCPU-4GB` instance is a billable UpCloud resource. Review UpCloud's
current [pricing](https://upcloud.com/pricing/) before applying.
