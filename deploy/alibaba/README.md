# Anonchat on Alibaba Cloud — Serverless App Engine (SAE)

Alibaba Cloud's SAE runs a Docker container with managed PostgreSQL (ApsaraDB
RDS) and optional persistent NAS/OSS storage, all declarable via Terraform
(`aliyun/alicloud`, mature/official) and Pulumi (`@pulumi/alicloud`, official
bridge).

**A full validated Terraform module for Alibaba Cloud is not yet included.**
The intended resource graph is documented below. For users comfortable reading
the `aliyun/alicloud` provider docs and wiring the same env vars every other
template in this directory wires, this is a concrete starting point.

## Intended resource graph

```
alicloud_vpc + alicloud_vswitch (public-friendly region, e.g. ap-southeast-1)
  → alicloud_sae_namespace (binds VPC/vswitch)
  → alicloud_sae_application (package_type="Image", liveness_v2 + readiness_v2
      on GET /health, envs block with all standard env vars)
  → alicloud_sae_ingress (SLB-backed public gateway — separate resource,
      no single "make it public" toggle)

alicloud_db_instance (engine="PostgreSQL", 17, vswitch_id for private-VPC-only)
  → alicloud_db_database ("anonchat")
  → alicloud_db_account ("anonchat")

alicloud_oss_bucket (S3-compatible via OSS — partial S3 API subset, works for
  basic put/get/delete) OR nas_configs on alicloud_sae_application for a
  real POSIX NAS mount (closer to the "local" storage-driver experience)
```

## Why a non-mainland-China region matters

Mainland-China Alibaba Cloud regions require real-name verification and (for
domains) ICP filing. **Pick an international region** (e.g. `ap-southeast-1`,
Singapore) to sidestep this entirely.

## Single-instance invariant

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").
SAE serves a single application with no built-in horizontal autoscaling —
configure exactly one instance.

## Provider docs

- Terraform: `aliyun/alicloud` — [registry.terraform.io/providers/aliyun/alicloud](https://registry.terraform.io/providers/aliyun/alicloud/latest)
- Pulumi: `@pulumi/alicloud` — [pulumi.com/registry/packages/alicloud](https://www.pulumi.com/registry/packages/alicloud/)
