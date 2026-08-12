# Anonchat on Huawei Cloud — Cloud Application Engine (CAE)

Huawei Cloud's **CAE** is the right container service — use CAE, not CCI,
which has no Terraform resource for deploying workloads. CAE's three-level
resource model (environment → application → component) is covered by the
`huaweicloud/huaweicloud` provider, though CAE specifically is one of the
rougher areas: env vars and health checks go through an untyped JSON blob
(`configurations` block, `type` + `data` as a raw JSON string matching
Huawei's `CreateComponentConfiguration` API) rather than typed HCL fields.

Terraform provider: `huaweicloud/huaweicloud` (official, huge, 1758+ resources,
but uneven per-resource-area quality). Pulumi: `huaweicloud/pulumi-huaweicloud`
(very immature, v0.0.12 — treat as experimental).

**A full validated Terraform module is not yet included.** The intended
resource graph:

## Intended resource graph

```
huaweicloud_vpc + huaweicloud_vpc_subnet + huaweicloud_networking_secgroup

huaweicloud_cae_environment (binds VPC/subnet/SG/SWR org name — SWR,
  the Software Repository for Container, is itself a prerequisite resource)

huaweicloud_cae_application (namespace/grouping)

huaweicloud_cae_component
  spec.runtime = "Docker"
  spec.source.type = "image" + url
  spec.resource_limit.cpu / memory
  spec.replica = 1 ← single-instance invariant

  configurations block: env vars + liveness/readiness probe JSON
    (hand-crafted jsonencode() local — the least Terraform-idiomatic
    part of any hyperscaler module surveyed; fetch Huawei's
    CreateComponentConfiguration API schema and model the JSON carefully)

huaweicloud_cae_domain (binds an ELB — separate resource for public ingress)

huaweicloud_rds_instance (db.type="PostgreSQL", 17, private-VPC-only;
  Huawei has the deepest Postgres-specific TF coverage of all clouds:
  62 rds_* resources including rds_pg_account, rds_pg_database,
  rds_pg_hba, rds_pg_plugin, etc.)

huaweicloud_obs_bucket (S3-compatible-ish — basic put/get/delete works;
  STORAGE_DRIVER=s3 path, since CAE's direct persistent-mount story is
  unclear from current docs)
```

## International region

Huawei Cloud International accounts cannot be used for ICP filing (a mainland-
China-only requirement). For a purely international deployment, pick a
non-China region and this is a non-issue.

## Provider docs

- Terraform: `huaweicloud/huaweicloud` — [registry.terraform.io/providers/huaweicloud/huaweicloud](https://registry.terraform.io/providers/huaweicloud/huaweicloud/latest)
