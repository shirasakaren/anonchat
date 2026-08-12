# Deploying Termine on Railway

Railway builds directly from this repo's root `Dockerfile` and provisions a
managed PostgreSQL database alongside the app. The desired state is declared
in [`.railway/railway.ts`](../../.railway/railway.ts) at the repo root.

## Prerequisites

- A Railway account ([railway.com](https://railway.com))
- The [Railway CLI](https://docs.railway.com/guides/cli) installed and signed in (`railway login`)
- This repo pushed to a GitHub repository Railway can access

## One-time setup

1. Edit `.railway/railway.ts` at the repo root:
   - Replace `"<owner>/<repo>"` in the `github(...)` call with your actual GitHub `owner/repo`.
2. From the repo root, link this directory to a Railway project:
   ```bash
   railway login
   railway init --name termine
   ```
3. Review what will be created:
   ```bash
   railway config plan
   ```
   This should show one Postgres database, one app service, and one volume being added - nothing else. **Nothing is created yet.**
4. Apply it (this provisions real, billable Railway resources):
   ```bash
   railway config apply
   ```
5. Set the two secrets Railway can't generate for you:
   ```bash
   railway variables set SESSION_SECRET="$(openssl rand -hex 32)" --service app
   ```
6. Deploy, then grab the assigned domain and set `PUBLIC_URL` to match:
   ```bash
   railway up --service app
   railway domain --service app        # generates *.up.railway.app, or attach your own
   railway variables set PUBLIC_URL="https://<your-domain>" --service app
   railway up --service app            # redeploy so the app picks up the new PUBLIC_URL
   ```
7. Visit your domain - you'll land on the first-run admin setup wizard.

## Optional: S3-compatible attachment storage

By default attachments are stored on Railway's persistent volume (`local`
driver). To use Cloudflare R2, AWS S3, or another S3-compatible provider
instead, set on the `app` service:

```bash
railway variables set STORAGE_DRIVER=s3 --service app
railway variables set S3_ENDPOINT=<endpoint> --service app
railway variables set S3_BUCKET=<bucket> --service app
railway variables set S3_ACCESS_KEY_ID=<key> --service app
railway variables set S3_SECRET_ACCESS_KEY=<secret> --service app
```

## Updating after a code change

```bash
git push
railway up --service app
```

Railway rebuilds the Docker image and redeploys; `docker-entrypoint.sh` runs
`prisma migrate deploy` automatically before the server starts, so schema
changes apply on their own.

## Costs

A Postgres database, a persistent volume, and an always-on app service are
all billable Railway resources. Review Railway's current pricing before
running `railway config apply`.
