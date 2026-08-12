# Anonchat on DigitalOcean — App Platform

DigitalOcean App Platform is one of the best "one-click" PaaS fits for
Anonchat: it builds directly from the repo's root Dockerfile, auto-provisions
HTTPS, and attaches a managed PostgreSQL cluster as an in-app database
component.

Two paths are documented here:

- **Deploy button + [`deploy.template.yaml`](../../.do/deploy.template.yaml)**
  at the repo root — the one-click Render/Railway-style path. Click, fill in
  the prompted secrets, done.
- **Terraform** below — same App Platform resources declared as HCL.
  Provider: official `digitalocean/digitalocean`.

**Persistent volumes are NOT supported on DO App Platform.** `STORAGE_DRIVER=s3`
against DigitalOcean Spaces (the native S3-compatible bucket) is the only
option — not a choice. This is switched to `s3` by default in both templates.
Pin `instance_count: 1` in the app spec (the WebSocket hub must run as exactly
one process — see `docs/ARCHITECTURE.md`, "Why no Redis").

No Pulumi template is provided: the official `@pulumi/digitalocean` package
matches the Terraform provider's resource coverage 1:1; the Terraform module
below is trivially translatable.

## Deploy button

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/<owner>/<repo>/tree/main)

Replace `<owner>/<repo>` with your actual GitHub `owner/repo` before clicking.

## Deploy via Terraform

```bash
cd deploy/digitalocean
terraform init
terraform plan \
  -var="github_repo=<owner>/<repo>" \
  -var="session_secret=$(openssl rand -hex 32)"
terraform apply -var="..." -var="..."
```

## Updating after a code change

Push to the connected branch. App Platform rebuilds and redeploys.
Migrations run automatically via `docker-entrypoint.sh`.

## Costs

App Platform instances, a managed PostgreSQL cluster, and Spaces buckets are
all billable DO resources. Review DigitalOcean's current [pricing](https://www.digitalocean.com/pricing) before deploying.
