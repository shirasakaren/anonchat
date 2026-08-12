# Cloud deployment templates

The primary, recommended way to self-host Anonchat is `docker compose up -d`
on any VPS — see the root [README](../README.md) and
[`scripts/setup.sh`](../scripts/setup.sh). Everything below is for deploying
to a specific cloud platform instead.

Every template builds the same [`Dockerfile`](../Dockerfile) and wires the
same environment variables documented in [`.env.example`](../.env.example);
they only differ in how each platform provisions PostgreSQL and networking.

## Architecture constraint every template enforces

The WebSocket hub ([`apps/server/src/realtime/hub.ts`](../apps/server/src/realtime/hub.ts))
holds all connection and subscriber state in **process-local JavaScript
`Map`/`Set` objects** — no Redis, no Postgres LISTEN/NOTIFY, no cross-process
pub/sub. This is a deliberate, documented design choice (see
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md), "Why no Redis"), not a bug.

**Every template below pins the app to exactly one running instance.** Where
the platform has an autoscaler or replica count, the default is overridden
to `min=1, max=1` — running two concurrent instances would silently split
chat delivery between two disjoint sets of in-memory state. Do not raise
this limit.

## PaaS — "few clicks" hosted platforms

These build from a git repo + Dockerfile, provision managed PostgreSQL, and
give you an auto-assigned HTTPS URL without managing VMs or infrastructure.

| Platform                                 | Template                                                  | Mechanism                         | Notes                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Railway](./railway/README.md)           | [`.railway/railway.ts`](../.railway/railway.ts)           | `railway config apply`            | Closest to Docker Compose UX; managed Postgres + persistent volume. Validated via TypeScript typecheck against Railway SDK's type declarations.                                 |
| [Render](./render/README.md)             | [`render.yaml`](../render.yaml)                           | Blueprint / deploy button         | Managed Postgres + persistent disk (5GB). Single-instance automatic with attached disk.                                                                                         |
| [Fly.io](./flyio/README.md)              | [`fly.toml`](../fly.toml)                                 | `flyctl launch` / `flyctl deploy` | Real Firecracker microVM — best architectural fit. Fly Managed Postgres + Fly Volume. No maintained Terraform/Pulumi provider exists (Fly archived theirs in 2024).             |
| [Northflank](./northflank/README.md)     | [`northflank.json`](./northflank/northflank.json)         | `northflank template run`         | Documented WebSocket support at LB. Volume-attach forces single-instance. No published Terraform/Pulumi provider.                                                               |
| [Koyeb](./koyeb/README.md)               | Deploy button URL                                         | URL / `koyeb.yaml`                | Serverless Postgres GA. Volumes still early-access (prefer S3 driver). Official TF provider (`koyeb/koyeb`) exists but is v0.1 — too immature for a validated module.           |
| [Zeabur](./zeabur/README.md)             | [`zeabur.yaml`](./zeabur/zeabur.yaml)                     | Dashboard template / CLI          | First-class Dockerfile support. Community TF provider exists (v0.0.2) but too immature to build on. WS behavior under idle tiers is unverified — test empirically.              |
| [Heroku](./heroku/README.md)             | [`heroku.yml`](../heroku.yml) + [`app.json`](../app.json) | Deploy button / `git push`        | Container stack, fully Dockerfile-based. Ephemeral filesystem (S3 mandatory). Dynos cycle every 24h (WS clients reconnect automatically). Official `heroku/heroku` TF provider. |
| [Clever Cloud](./clevercloud/README.md)  | CLI / Git push                                            | `clever create --type docker`     | Best native Pulumi provider (not Terraform-bridged). FS Buckets unavailable for Docker apps (S3 via Cellar mandatory). Official TF + native Pulumi.                             |
| [DigitalOcean](./digitalocean/README.md) | [`.do/deploy.template.yaml`](../.do/deploy.template.yaml) | Deploy button / Terraform         | App Platform — builds Dockerfile, auto-HTTPS. No persistent volumes on App Platform (Spaces/S3 mandatory). Official `digitalocean/digitalocean` TF + `@pulumi/digitalocean`.    |

## Self-hosted PaaS — run on your own VPS

These are free, open-source platforms that run ON a VPS you provision. Each
gives you git-push-to-deploy or compose-file-as-config without a hosted
cloud service between you and your server.

| Platform                         | Template                                                          | Mechanism                       | Notes                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Coolify](./coolify/README.md)   | [`docker-compose.coolify.yml`](../docker-compose.coolify.yml)     | Coolify Docker Compose resource | Adapts the root compose file for Coolify's Traefik proxy. Profiles bug workaround (minio removed). Magic-var secrets instead of `.env` file. No TF/Pulumi provider. |
| [Dokku](./dokku/README.md)       | [`CHECKS`](../CHECKS) + [`nginx.conf.sigil`](../nginx.conf.sigil) | `git push dokku main`           | Leanest git-push option. WebSocket proxying needs custom nginx sigil (included). Community TF provider (`aliksend/dokku`) for declarative app+addon provisioning.   |
| [CapRover](./caprover/README.md) | [`captain-definition`](../captain-definition)                     | CapRover dashboard / CLI        | Docker Swarm-based. First-class WS toggle (no manual nginx editing). Persistent directories auto-pin to single node. No TF/Pulumi provider.                         |

## IaaS — Terraform modules for VM-based deploys

These provision a single VM (with cloud-init bootstrapping via the shared
[`cloud-init.yaml.tpl`](./vps/cloud-init.yaml.tpl) template), optionally a
managed PostgreSQL instance if the provider offers one, and an attached
persistent volume. The VM runs the same `docker compose` stack any
self-hosted install uses.

Each module has been **Terraform-validated** (`terraform init -backend=false
&& terraform validate` passes) against the current provider version declared
in its `required_providers` block. None have been applied against a live
cloud account — review each provider's current pricing before applying.

| Platform                                     | Provider                    | Managed PG                                       | Notes                                                                                                                                           |
| -------------------------------------------- | --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [Hetzner](./hetzner/README.md)               | `hetznercloud/hcloud`       | No (self-hosted via compose)                     | Floating IP allocated before VM — single-apply PUBLIC_URL. Official `@pulumi/hcloud`.                                                           |
| [DigitalOcean](./digitalocean/README.md)     | `digitalocean/digitalocean` | Optional (`digitalocean_database_cluster`)       | Also available as a PaaS deploy button (see PaaS section above). Official `@pulumi/digitalocean`.                                               |
| [Vultr](./vultr/README.md)                   | `vultr/vultr`               | Optional (`vultr_database`)                      | Reserved IP before VM. Community Pulumi only (`@pulumiverse/vultr`).                                                                            |
| [Scaleway](./scaleway/README.md)             | `scaleway/scaleway`         | Optional (`scaleway_rdb_instance`)               | user_data is a MAP with `cloud-init` key — not a plain string. Community Pulumi (`@pulumiverse/scaleway`).                                      |
| [UpCloud](./upcloud/README.md)               | `UpCloudLtd/upcloud`        | Optional (`upcloud_managed_database_postgresql`) | `metadata = true` required for cloud-init delivery. Vendor-maintained Pulumi, low version.                                                      |
| [OVHcloud](./ovhcloud/README.md)             | `ovh/ovh`                   | Optional (`ovh_cloud_project_database`)          | Volume attach needs separate OpenStack provider (intentionally skipped here — rely on VM root disk). Official `@ovhcloud/pulumi-ovh`.           |
| [Akamai Connected Cloud](./akamai/README.md) | `linode/linode`             | Optional (`linode_database_postgresql_v2`)       | Metadata-service-based cloud-init (not available in every region — pick a supported one). Official `@pulumi/linode`.                            |
| [Contabo](./contabo/README.md)               | `contabo/contabo`           | No (self-hosted via compose)                     | No block volume or managed PG available — lean on the VM's baked-in storage + compose Postgres. Pre-1.0 TF provider. No Pulumi provider exists. |

## Hyperscaler clouds — documented approach, full TF modules pending

These platforms have mature Terraform providers, rich managed-service catalogs,
and well-understood resource maps based on current provider documentation.
The README in each directory documents the exact resource graph and the
platform-specific gotchas — enough to hand-roll a module yourself. Full
validated `.tf` modules (matching the IaaS templates above) are not yet
included; PRs welcome.

| Platform                             | Container service           | Database                     | Provider                            | Notable factors                                                                                                                                                                 |
| ------------------------------------ | --------------------------- | ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AWS](./aws/README.md)               | App Runner                  | RDS PostgreSQL               | CloudFormation (validated template) | **Existing validated template.** VPC connector required for private RDS.                                                                                                        |
| [GCP](./gcp/README.md)               | Cloud Run                   | Cloud SQL                    | `hashicorp/google`                  | **Existing validated template.** Cloud Run scale pinned to max=1 for WS hub.                                                                                                    |
| [Azure](./azure/README.md)           | Container Apps              | PostgreSQL Flexible Server   | Bicep (validated AVM modules)       | **Existing validated template.** Scale pinned to max=1.                                                                                                                         |
| [Alibaba Cloud](./alibaba/README.md) | SAE (Serverless App Engine) | ApsaraDB RDS for PG          | `aliyun/alicloud`                   | **Use international region to skip ICP filing.** SAE needs separate ingress resource for public URL. Official `@pulumi/alicloud`.                                               |
| [OCI](./oci/README.md)               | Container Instances         | OCI Database with PostgreSQL | `oracle/oci`                        | **No automatic HTTPS/DNS** — need OCI LB in front (the biggest asymmetry vs. other containers). Strong S3-compat story. Official `@pulumi/oci`.                                 |
| [IBM Cloud](./ibm/README.md)         | Code Engine                 | Databases for PostgreSQL     | `IBM-Cloud/ibm`                     | **Single cleanest resource model surveyed.** Must explicitly pin min=max=1 (override Code Engine's autoscaling default — the opposite of normal advice). Community Pulumi only. |
| [Tencent Cloud](./tencent/README.md) | TEM (not CloudBase Run)     | TencentDB for PostgreSQL     | `tencentcloudstack/tencentcloud`    | **Use TEM, not TCBR** (TCBR has zero Terraform coverage). International site recommended. Bridged Pulumi.                                                                       |
| [Huawei Cloud](./huawei/README.md)   | CAE (not CCI)               | RDS for PostgreSQL           | `huaweicloud/huaweicloud`           | **Env vars/health checks need hand-crafted JSON** in `configurations` block — least TF-idiomatic of all surveyed. SWR org prerequisite. Pulumi immature (v0.0.12).              |

## Platforms considered but excluded

These were researched and found not to fit Anonchat's architecture
(a single always-on process holding WebSocket state in memory, needing a
normal PostgreSQL TCP connection and either a persistent disk or an
S3-compatible bucket):

| Platform                | Reason                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**              | Serverless functions only — max 800s duration (extended), 5min default. WebSocket beta explicitly requires external state store; no long-running compute.                                 |
| **Netlify**             | Serverless functions only — 10s–26s execution cap, Background Functions max 15min async. No always-on compute primitive.                                                                  |
| **Platform.sh / Upsun** | Cannot deploy an arbitrary Dockerfile — builds from Platform.sh's own maintained base images. Would need to re-express the entire pnpm-workspace multi-stage build as build/deploy hooks. |
| **Scalingo**            | Buildpack-only — no Dockerfile support. No persistent-disk primitive at all (fully ephemeral filesystem).                                                                                 |
| **Qovery**              | Requires a full Kubernetes cluster in your own cloud account (EKS/GKE/AKS) + Qovery's SaaS fee ($899+/mo). Disproportionate infrastructure for one container + one Postgres.              |
| **Deta Space**          | Shut down October 17, 2024 (confirmed by Deta's own announcement). No deploy path exists.                                                                                                 |

## Validation status

- **Terraform modules marked "validated"**: `terraform init -backend=false &&
terraform validate` passes against the current provider version from the
  public registry. No live-account apply — these provision real, billable
  infrastructure.
- **Azure Bicep**: `az bicep build` succeeds. Public AVM module references
  resolve correctly.
- **AWS CloudFormation**: `aws cloudformation validate-template` succeeds
  against the real CloudFormation API.
- **Fly.toml**: `flyctl config validate` runs locally (no Fly account
  required for syntax-level validation).
- **README-only platforms**: the documented resource graph is based on
  current provider registry docs but the `.tf` module itself hasn't been
  through `init`/`validate` yet — the errata you'd catch in that cycle
  (deprecated arguments, renamed resources, required blocks not obvious
  from the summary docs) are the next increment of work if you adopt one
  of those platforms.
