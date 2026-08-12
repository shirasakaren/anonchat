# Anonchat on Tencent Cloud — TEM (Elastic Microservice Platform)

Tencent Cloud's **TEM** is the correct container service for this app — use
TEM, not CloudBase Run (TCBR), which has zero Terraform resource coverage in
the `tencentcloudstack/tencentcloud` provider. TEM has full Terraform coverage
for every resource needed: application, workload (env vars, liveness/readiness
HTTP probes, NFS-backed persistent volumes), gateway for public ingress, and
TencentDB for PostgreSQL.

Terraform provider: `tencentcloudstack/tencentcloud` (official, large, mature).
Pulumi: bridged `@pulumi/tencentcloud`.

**A full validated Terraform module is not yet included.** The intended
resource graph:

## Intended resource graph

```
tencentcloud_vpc + tencentcloud_subnet

tencentcloud_tem_environment (binds VPC/subnet)
tencentcloud_tem_application
tencentcloud_tem_workload
  image: public Docker Hub image (repo_type=2) or TCR image
  replicas: 1 ← single-instance invariant
  env_conf: full env var list (key/value pairs)
  liveness/readiness/startup_probe: type=HttpGet, path=/health, port=3000
  storage_confs + storage_mount_confs: NFS-backed persistent volume for uploads
    (Tencent Cloud File Storage / CFS), or skip for STORAGE_DRIVER=s3 alternative
tencentcloud_tem_gateway (public ingress — separate resource)

tencentcloud_postgresql_instance (PG 17, private-VPC-only access)
```

COS (Cloud Object Storage) has strong, well-documented S3-API compatibility
(endpoint form: `https://cos.<region>.myqcloud.com`) for the S3 storage path.

## International site

Use the Tencent Cloud International site — real-name verification / ICP
filing is only required for mainland-China-facing websites. International
accounts need neither.

## Provider docs

- Terraform: `tencentcloudstack/tencentcloud` — [registry.terraform.io/providers/tencentcloudstack/tencentcloud](https://registry.terraform.io/providers/tencentcloudstack/tencentcloud/latest)
