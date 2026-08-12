# Anonchat on IBM Cloud — Code Engine

IBM Cloud Code Engine (`ibm_code_engine_app`) is the single best-modeled
serverless container resource found for this app — direct typed fields for
env vars, liveness/readiness HTTP probes, automatic public HTTPS endpoint via
`managed_domain_mappings = "local_public"`, all in a single resource.

Terraform: official `IBM-Cloud/ibm` (well-documented for exactly these three
resource types: Code Engine app, Databases-for-PostgreSQL, COS bucket).
Pulumi: community `@pulumiverse/ibm` (lower maturity than the TF provider).

**A full validated Terraform module is not yet included.** The intended
resource graph:

## Intended resource graph

```
ibm_code_engine_app
  image_reference: full ICR / public image URI
  image_port: 3000
  managed_domain_mappings: "local_public" (auto-HTTPS, zero extra resources)
  run_env_variables: full env var list (type="literal")
  probe_liveness + probe_readiness: type="http", path="/health", port=3000
  scale_min_instances: 1  ← CRITICAL: pin to 1 for the single-instance WS hub
  scale_max_instances: 1  ←     (not the default autoscaling — override it
                               explicitly, this is the opposite of what you'd
                               normally want on Code Engine)
  run_volume_mounts: type="persistent_data_store" (a COS bucket mounted
    via s3fs-backed credentials — effectively STORAGE_DRIVER=s3 in practice
    since Code Engine has no native block-volume mount)

ibm_database (service="databases-for-postgresql", service_endpoints="private")
  + ibm_resource_key for connection credentials

ibm_resource_instance (type="cloud-object-storage")
  + ibm_cos_bucket (for S3-compatible attachments)
```

## Region constraint

Code Engine is only available in: `au-syd, br-sao, ca-tor, eu-de, eu-gb,
eu-es, jp-osa, jp-tok, us-east, us-south`. Default to one of these.

## Single-instance invariant

The WebSocket hub holds all connection/subscriber state in process-local
memory — no Redis, no pub/sub (see `docs/ARCHITECTURE.md`, "Why no Redis").
Code Engine's default autoscaling would silently spin up multiple concurrent
instances under load and split chat delivery. **You must set
`scale_min_instances = 1` AND `scale_max_instances = 1`** — this is the
opposite of what Code Engine's docs recommend, and it's a correctness
requirement for this specific app, not a performance tradeoff.

## Provider docs

- Terraform: `IBM-Cloud/ibm` — [registry.terraform.io/providers/IBM-Cloud/ibm](https://registry.terraform.io/providers/IBM-Cloud/ibm/latest)
