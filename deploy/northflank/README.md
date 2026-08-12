# Anonchat on Northflank

Northflank has first-class Dockerfile builds, documented WebSocket support at
its load balancer, and a direct (non-pooled) PostgreSQL connection string that
works with `prisma migrate deploy` unmodified. Attaching a persistent volume
to the service automatically pins it to exactly one instance — the same
architecture Anonchat needs for its in-process WebSocket pub/sub.

**No published Terraform or Pulumi provider exists for Northflank** (only an
unpublished third-party repository on GitHub, not on the public Terraform
Registry). The `northflank.json` template and the CLI are the supported IaC
path.

Template: [`northflank.json`](./northflank.json)

## Prerequisites

- A Northflank account ([northflank.com](https://northflank.com))
- [Northflank CLI](https://docs.northflank.com/cli) installed and signed in
  (`northflank auth login`)
- This repo pushed to a GitHub repository Northflank can access
- Replace `<owner>/<repo>` in `northflank.json` with your actual GitHub
  `owner/repo` before deploying

## Deploy

```bash
northflank template run -f deploy/northflank/northflank.json
```

This provisions a PostgreSQL 17 addon and an app service built from the
repo's root Dockerfile with a persistent volume at `/app/data/uploads`, all
real and billable. You can also run the template from the Northflank
dashboard ("Run a template" action).

## Post-deploy

Set `SESSION_SECRET` and `PUBLIC_URL` in the Northflank dashboard under your
app's environment variables (the template's PostgreSQL addon auto-injects
`DATABASE_URL` for you), then redeploy:

```bash
northflank deploy --service anonchat
```

Visit the assigned domain — you'll land on the first-run admin setup wizard.

## Updating after a code change

Push to the connected branch. Northflank rebuilds the Docker image and
redeploys; `docker-entrypoint.sh` runs `prisma migrate deploy` automatically
before the server binds its port, so schema changes apply on their own.

## Storage note

Attaching a persistent volume to this service pins it to exactly one instance
(Northflank's own documented behavior). This is the correct shape for
Anonchat — the WebSocket hub keeps all connection/subscriber state in
process-local memory (see `docs/ARCHITECTURE.md`, "Why no Redis") and a
second concurrent instance would silently split chat delivery. Keep
`deployment.instances` at 1.

## Costs

A PostgreSQL addon and an app service with a persistent volume are all
billable Northflank resources. Review Northflank's current
[pricing](https://northflank.com/pricing) before running the template.
