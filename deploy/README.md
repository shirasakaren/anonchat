# Cloud deployment templates

The primary, recommended way to self-host Anonchat is `docker compose up -d`
on any VPS - see the root [README](../README.md) and
[`scripts/setup.sh`](../scripts/setup.sh). Everything below is for deploying
to a specific cloud platform instead.

Every template builds the same [`Dockerfile`](../Dockerfile) and wires the
same environment variables documented in [`.env.example`](../.env.example);
they only differ in how each platform provisions Postgres and networking.

| Platform | Template | Notes |
|---|---|---|
| [Railway](./railway/README.md) | [`.railway/railway.ts`](../.railway/railway.ts) | Closest to the Docker Compose experience; managed Postgres + persistent volume. |
| [Render](./render/README.md) | [`render.yaml`](../render.yaml) | One-click Blueprint; managed Postgres + persistent disk. |
| [AWS](./aws/README.md) | [`apprunner-rds.yaml`](./aws/apprunner-rds.yaml) | App Runner + private RDS Postgres via VPC connector. |
| [GCP](./gcp/README.md) | [`main.tf`](./gcp/main.tf) | Cloud Run (scales to zero) + Cloud SQL; attachments via GCS's S3-compatible API. |
| [Azure](./azure/README.md) | [`main.bicep`](./azure/main.bicep) | Container Apps + PostgreSQL Flexible Server; attachments need an external S3-compatible provider (see its README). |

All five have been locally validated (`terraform validate`, `az bicep
build`, a real `aws cloudformation validate-template` call, and a real
TypeScript typecheck against the Railway SDK's own type declarations) to
confirm every resource type and field name is correct. **None of them have
been applied against a live cloud account** - running any of these
provisions real, billable infrastructure, so that step is left to you.

Every template provisions a database and a running app service - review
each provider's current pricing before applying.
