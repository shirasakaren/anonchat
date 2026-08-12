# Anonchat on Koyeb

Koyeb builds directly from this repo's root Dockerfile and provides a managed
"Serverless Postgres" addon (GA, versions 14–17). Two paths:

- **Deploy button** (querystring URL, no committed config file):
  `https://app.koyeb.com/deploy?type=git&repository=github.com/<owner>/<repo>&branch=main&name=anonchat&builder=dockerfile&dockerfile=Dockerfile&ports=3000;http;/&env[NODE_ENV]=production`
- **`koyeb.yaml`** and [`main.tf`](./main.tf) below for CLI/IaC-driven deploys.

**Two caveats worth knowing:**

1. **Persistent volumes are still unstable on Koyeb** (node-local, 2 regions
   only, 1–10GB cap, can fail on node loss/reattachment). `STORAGE_DRIVER=s3`
   against a third-party S3-compatible bucket is the safer default — say so
   plainly rather than pretending the local-disk path is production-ready.

2. **WebSocket idling:** Koyeb can cut idle WS connections after ~30s of
   silence (upstream proxy behavior, not the platform's own scale-to-zero
   timer). The app sends no ping/pong keepalive, so a truly idle connection
   may drop. The client reconnects over REST automatically (see
   `docs/ARCHITECTURE.md`) — not a functional break, just a UX note.

Template: [`main.tf`](./main.tf). Terraform provider: `koyeb/koyeb`
(official, HashiCorp-partner, v0.1.11). Pulumi: no native package found;
use `pulumi package add terraform-provider registry.terraform.io/koyeb/koyeb`
for bridged support.

## Prerequisites

- A Koyeb account ([koyeb.com](https://www.koyeb.com))
- A [Koyeb API token](https://app.koyeb.com/settings/api)

## Deploy

```bash
cd deploy/koyeb
terraform init
terraform plan \
  -var="github_repo=<owner>/<repo>" \
  -var="session_secret=$(openssl rand -hex 32)"
terraform apply -var="..." -var="..."
```

## Updating after a code change

Push to the connected branch. Koyeb rebuilds and redeploys. Migrations run
automatically via `docker-entrypoint.sh`.

## Single-instance invariant

The WebSocket hub holds all connection/subscriber state in process-local
memory (no Redis, no pub/sub — see `docs/ARCHITECTURE.md`, "Why no Redis").
The Terraform module pins the service to 1 instance. Never scale beyond one.

## Costs

Serverless Postgres and an app service are billable Koyeb resources.
Review Koyeb's current [pricing](https://www.koyeb.com/pricing) before deploying.
