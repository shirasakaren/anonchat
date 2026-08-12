# Anonchat on Zeabur

Zeabur has first-class Dockerfile-deploy support (it auto-detects a root
`Dockerfile`) and a one-click marketplace PostgreSQL template with a direct
connection string auto-shared between services in the same project.

Template: [`zeabur.yaml`](./zeabur.yaml)

**A community Terraform provider exists** (`incubator4/zeabur`, v0.0.2,
under 1,000 total downloads) but is too immature to build a template on.
No Pulumi provider exists. The `zeabur.yaml` template and the Zeabur
dashboard's "Deploy Button" generator are the supported IaC path.

**One caveat to test before relying on it in production:** Zeabur's idle/sleep
behavior on lower-tier plans may drop long-lived WebSocket connections, and
this isn't clearly documented in Zeabur's current docs. Verify empirically
against your plan, or use a tier that disables instance sleep entirely.

## Prerequisites

- A Zeabur account ([zeabur.com](https://zeabur.com))
- This repo pushed to a GitHub repository
- Replace `<owner>/<repo>` in the "Deploy to Zeabur" URL below with your
  actual GitHub `owner/repo`

## Deploy

The `zeabur.yaml` template at [`deploy/zeabur/zeabur.yaml`](./zeabur.yaml) is
a best-effort starting point; Zeabur's git-service YAML schema isn't fully
published outside its own dashboard. For a guaranteed-correct template,
generate a "Deploy Button" from the dashboard instead (Account → Template tab)
and embed the generated snippet in your README.

```bash
# With the CLI (if the template works as-is):
zeabur template apply -f deploy/zeabur/zeabur.yaml
```

## Post-deploy

Set `SESSION_SECRET` and `PUBLIC_URL` in the Zeabur dashboard under your
app's environment variables (the PostgreSQL service auto-injects its
connection string via `POSTGRES_CONNECTION_STRING` — map this to
`DATABASE_URL`), then redeploy. Visit the assigned domain to hit the
first-run admin setup wizard.

## Updating after a code change

Push to the connected branch. Zeabur rebuilds the Docker image and redeploys.
Migrations run automatically via `docker-entrypoint.sh`.

## Costs

A PostgreSQL service and an app service with a persistent volume are billable
Zeabur resources. Review Zeabur's current [pricing](https://zeabur.com/pricing)
before deploying.
