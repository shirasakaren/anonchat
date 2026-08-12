# Anonchat on Oracle Cloud Infrastructure (OCI)

OCI Container Instances runs a single container (like a managed VM, not an
autoscaling PaaS — actually the right shape for Anonchat's single-instance
model), with managed PostgreSQL (OCI Database with PostgreSQL, GA) and Object
Storage with strong S3-compatibility (SigV4). The Terraform provider
(`oracle/oci`) is very mature and official.

**A full validated Terraform module for OCI is not yet included.**
The intended resource graph is documented below. OCI's networking
prerequisites (compartment, VCN, subnet, internet gateway, security list)
are more involved than most other clouds, and the Container Instance only
gets a bare IP — a public HTTPS URL needs an OCI Load Balancer in front.

## Intended resource graph

```
oci_identity_compartment (passed in by the user via variable)

oci_core_vcn + oci_core_subnet + oci_core_internet_gateway
  + oci_core_route_table + oci_core_security_list

oci_container_instances_container_instance
  containers[0].environment_variables: full env var map
  containers[0].health_checks: HTTP GET /health
  volumes: Block Volume or FSS (real POSIX disk for "local" driver)

oci_psql_db_system (PG 17, private-subnet),
  shape: PostgreSQL.VM.Standard.E4.Flex.2.32GB

oci_load_balancer + oci_load_balancer_backend_set
  + oci_load_balancer_listener (fronts the container instance)

oci_objectstorage_bucket (S3-compatible, SigV4-only,
  endpoint form: https://<namespace>.compat.objectstorage.<region>.oraclecloud.com)
```

## The LB requirement, stated plainly

Container Instances gets a VNIC with a bare IP — no automatic HTTPS endpoint
or DNS the way Cloud Run/App Runner/Container Apps give you. An OCI Load
Balancer (with your own cert or OCI-managed cert) is the standard way to put
a public HTTPS URL in front of it. This adds several interdependent resources
to the module. If you're prototyping, assigning a public IP directly to the
Container Instance's VNIC (`is_public_ip_assigned = true`) skips the LB but
gives you no TLS and a potentially-unstable IP.

## Provider docs

- Terraform: `oracle/oci` — [registry.terraform.io/providers/oracle/oci](https://registry.terraform.io/providers/oracle/oci/latest)
- Pulumi: `@pulumi/oci` — official, full parity
