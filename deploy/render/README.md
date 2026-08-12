# Deploying Termine on Render

Render builds directly from this repo's root `Dockerfile` using the Blueprint
defined in [`render.yaml`](../../render.yaml) at the repo root, which also
provisions a managed PostgreSQL database.

## Prerequisites

- A Render account ([render.com](https://render.com))
- This repo pushed to a GitHub or GitLab repository Render can access

## Deploy

1. Push this repo (including `render.yaml`) to GitHub/GitLab.
2. In the Render dashboard, go to **Blueprints -> New Blueprint Instance** and select the repo.
3. Render reads `render.yaml` and shows a preview: one Postgres database (`termine-db`) and one web service (`termine`) with a 5GB persistent disk for attachments. Review it, then click **Apply**.
4. `SESSION_SECRET` is generated automatically and `DATABASE_URL` is wired to the database automatically. You'll be prompted for `PUBLIC_URL` - leave it blank for now.
5. Once the first deploy finishes, copy the assigned `https://termine-<id>.onrender.com` URL (or attach a custom domain under the service's **Settings -> Custom Domains**).
6. Go to the service's **Environment** tab, set `PUBLIC_URL` to that URL, and save - this triggers a redeploy.
7. Visit your URL - you'll land on the first-run admin setup wizard.

## Optional: S3-compatible attachment storage

By default attachments are stored on Render's persistent disk. To use
Cloudflare R2, AWS S3, or another S3-compatible provider instead, add these
environment variables in the service's **Environment** tab and remove the
`disk` section from `render.yaml` if you no longer need local storage:

```
STORAGE_DRIVER=s3
S3_ENDPOINT=<endpoint>
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
```

## Updating after a code change

Render auto-deploys on every push to the branch you selected (`autoDeployTrigger: commit`
in `render.yaml`). `docker-entrypoint.sh` runs `prisma migrate deploy`
automatically before the server starts, so schema changes apply on their own.

## Costs

The `starter` web service plan and `basic-256mb` Postgres plan are both
billable. Review Render's current pricing before applying the Blueprint.
