# Anonchat on OVHcloud

OVHcloud's former "Web PaaS" was EOL'd in Oct 2024. This template uses their
Public Cloud IaaS: a single VM bootstrapped via cloud-init running the full
`docker compose` stack with self-hosted PostgreSQL.

**Storage note:** The `ovh/ovh` provider's volume resource has no instance-attach
capability — OVH's own official guidance for attaching volumes uses a separate
OpenStack-compatible provider (`terraform-provider-openstack/openstack`). This
template deliberately skips both to stay simple: the VM's own root storage is
real persistent local disk (not ephemeral like a PaaS container), and it's
sized large enough for compose's PostgreSQL and uploads volumes. If you need a
separate managed volume, the OpenStack provider approach is documented in
OVH's own guides.

Template: [`main.tf`](./main.tf). Terraform provider: `ovh/ovh` (official).
Pulumi: official `@ovhcloud/pulumi-ovh` (OVH-published, v2.15.0+).

## Prerequisites

- An OVHcloud Public Cloud project ([ovhcloud.com](https://www.ovhcloud.com))
- [OVHcloud API credentials](https://api.ovh.com/createToken/)

## Deploy

```bash
cd deploy/ovhcloud
terraform init
terraform plan \
  -var="service_name=<project-id>" \
  -var="repo_url=https://github.com/<owner>/<repo>.git" \
  -var="postgres_password=$(openssl rand -base64 24 | tr -d '=+/')" \
  -var="session_secret=$(openssl rand -hex 32)"
terraform apply -var="..." -var="..."
```

Use the instance IP from `terraform output ip_address` and re-apply with
`public_url` set (two-step apply, like the GCP/AWS templates).

## Updating after a code change

SSH into the VM and run `cd /opt/anonchat/src && git pull && docker compose up -d --build`.

## Why a single VM

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").

## Costs

An OVHcloud Public Cloud instance is a billable resource. Review OVHcloud's
current [pricing](https://www.ovhcloud.com/en/public-cloud/prices/) before applying.
