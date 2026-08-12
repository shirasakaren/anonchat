# Anonchat on Heroku

Heroku runs Anonchat via its container/Docker stack: each web dyno is a
real long-running container process — holds WebSocket connections fine,
handles a normal PostgreSQL connection pool unmodified. The app's
`heroku.yml` tells Heroku to build from this repo's root Dockerfile instead
of buildpack-detecting it.

**One real caveat:** Heroku force-restarts every dyno at least once every
24 hours ("dyno cycling"). This will sever all open WebSocket connections on
a schedule outside your control. The client reconnects automatically over REST
(see `docs/ARCHITECTURE.md`), so this isn't a functional break — just a
"connections will reset roughly once a day" UX note.

**One storage constraint:** Heroku's filesystem is fully ephemeral — wiped on
every dyno restart/cycle. `STORAGE_DRIVER=s3` is NOT optional on Heroku; there
is no local-disk option. Use an S3-compatible provider (AWS S3, Cloudflare R2,
Backblaze B2) and set the `S3_*` environment variables.

Root config files: [`heroku.yml`](../../heroku.yml) (container stack),
[`app.json`](../../app.json) (deploy button + config schema).

Terraform: official `heroku/heroku` provider. Note that Terraform can create
the app + addon but the actual container image push/deploy is a separate
`git push heroku main` or `heroku container:push web` step — Terraform alone
does not fully deploy the code for a container-stack app (unlike buildpack
apps where `heroku_build` handles it). The README's CLI steps below cover
the full flow.

Pulumi: official-adjacent Pulumi-maintained bridge `@pulumiverse/heroku`.

## Deploy button

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/<owner>/<repo>)

Replace `<owner>/<repo>` with your GitHub owner/repo name before clicking.
Heroku auto-generates `SESSION_SECRET` and provisions a PostgreSQL 17 addon.
You'll need to set `PUBLIC_URL` and S3 credentials after the first deploy.

## CLI setup

```bash
heroku create anonchat --stack container
heroku addons:create heroku-postgresql:mini
heroku config:set SESSION_SECRET="$(openssl rand -hex 32)"
heroku config:set STORAGE_DRIVER=s3
heroku config:set S3_ENDPOINT=<endpoint> S3_BUCKET=<bucket> S3_ACCESS_KEY_ID=<key> S3_SECRET_ACCESS_KEY=<secret>
git push heroku main
heroku config:set PUBLIC_URL="https://anonchat.herokuapp.com"
```

Visit the URL — you'll land on the first-run admin setup wizard.

## Updating after a code change

```bash
git push heroku main
```

Heroku rebuilds and redeploys. Migrations run automatically via
`docker-entrypoint.sh` before the server binds its port.

## Costs

A web dyno and a Heroku Postgres addon are billable Heroku resources.
Note: Salesforce moved Heroku to "sustaining engineering" in February 2026
(no new features, no new Enterprise contracts, but existing behavior and
credit-card-billed apps continue unchanged). Review Heroku's current
[pricing](https://www.heroku.com/pricing) before deploying.
