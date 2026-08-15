# Deploying Anonchat on Railway

Anonchat ships as a one-click Railway template. The template provisions a
managed PostgreSQL database and one app service that pulls the official
Docker image (`shirasakaren/anonchat:latest`, built from this repo by CI on
every push to `main`), so the deployer never waits for a source build.

Everything required to run is wired automatically when the template deploys:

- `DATABASE_URL` points at the provisioned Postgres over Railway's private
  network (`${{Postgres.DATABASE_URL}}`)
- `SESSION_SECRET` is generated on deploy with a template variable function
- `PUBLIC_URL` is derived from the generated `*.up.railway.app` domain
- `TRUST_PROXY` is enabled (the app sits behind Railway's proxy)
- A persistent volume is mounted at `/app/data/uploads` for attachment
  storage, and the image's built-in `/health` endpoint is used as the
  healthcheck
- Database migrations run automatically on every start via
  `docker-entrypoint.sh` (`prisma migrate deploy`)

## One-click deploy (recommended)

1. Open the template page and click **Deploy**.
2. Pick a team/project name and deploy - no variables to fill in.
3. Open the generated `*.up.railway.app` URL and complete the one-time
   admin setup wizard.

## Post-deploy (optional but recommended)

- Attach a custom domain (Railway manages TLS automatically), then the
  `PUBLIC_URL` reference updates on the next deploy.
- Attachment storage defaults to the local volume (`local` driver). To use
  Cloudflare R2, AWS S3, or any S3-compatible provider, set on the
  `anonchat` service:
  ```bash
  railway variables set STORAGE_DRIVER=s3 --service anonchat
  railway variables set S3_ENDPOINT=<endpoint> --service anonchat
  railway variables set S3_BUCKET=<bucket> --service anonchat
  railway variables set S3_ACCESS_KEY_ID=<key> --service anonchat
  railway variables set S3_SECRET_ACCESS_KEY=<secret> --service anonchat
  ```
- Email digests and Web Push are optional; see
  [`.env.example`](../../.env.example) for the variables.

## Updating the image

The template pins `shirasakaren/anonchat:latest`. The app redeploys with a
new image whenever you trigger it - either restart the service manually or
redeploy the service in the Railway dashboard. Migrations run automatically
before the server starts, so schema changes apply on their own.

## Template maintenance

The published template is generated from the `anonchat` blueprint project
in the Shirasaka Ren workspace:

```bash
# After changing the blueprint project's services/variables:
railway templates create --project <blueprint-project-id> --json
# then publish/update with the marketplace metadata:
railway templates publish <template-id> \
  --category Other \
  --description "End-to-end encrypted anonymous messaging inbox" \
  --readme-file TEMPLATE.md \
  --image https://raw.githubusercontent.com/shirasakaren/anonchat/main/branding/anonchat-256.png \
  --demo-project <public-demo-project-id>
```

The marketplace overview lives in [`TEMPLATE.md`](TEMPLATE.md).

## Infrastructure-as-code alternative

[`.railway/railway.ts`](../../.railway/railway.ts) at the repo root declares
an equivalent setup (Postgres + app + uploads volume) that builds from the
repo's own `Dockerfile` instead of pulling the image. To use it:

1. Edit `.railway/railway.ts` and replace `"<owner>/<repo>"` with the actual
   GitHub `owner/repo`.
2. From the repo root:
   ```bash
   railway init --name anonchat
   railway config plan    # review: one Postgres, one app, one volume
   railway config apply
   ```
3. Set the secret Railway can't generate for you:
   ```bash
   railway variables set SESSION_SECRET="$(openssl rand -hex 32)" --service app
   ```
4. Deploy (`railway up --service app`), then set `PUBLIC_URL` to the
   assigned domain and redeploy.

## Costs

A Postgres database, a persistent volume, and an app service are billable
Railway resources. Review Railway's current pricing before deploying.
