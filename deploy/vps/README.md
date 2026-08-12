# Shared VPS bootstrap

[`cloud-init.yaml.tpl`](./cloud-init.yaml.tpl) is not a deployable target by
itself - it's the shared bootstrap script referenced by every plain
VPS/IaaS provider template in this directory (Hetzner, DigitalOcean, Vultr,
Scaleway, UpCloud, Contabo, OVHcloud, Akamai Connected Cloud). Each of those
templates provisions a VM plus whatever provider-specific storage/database
resources make sense, then hands this same script to the VM as
user-data/cloud-init so first boot ends with the same `docker compose up -d
--build` any self-hosted install runs (see the root
[README](../../README.md) and [`scripts/setup.sh`](../../scripts/setup.sh)).

It's non-interactive by design, since cloud-init has no terminal to prompt
on - every value it needs (Postgres password, session secret, optional S3
credentials) is filled in by the calling Terraform/Pulumi program from
variables/config you provide up front, the same way the AWS/GCP/Azure
templates ask for `db_password`/`session_secret` as apply-time inputs.

It intentionally does not set up a reverse proxy, TLS, or a firewall beyond
what each provider's own template configures - that matches
`scripts/setup.sh`'s scope for any other self-hosted install. Put Anonchat
behind Caddy/nginx/a tunnel with your own domain if you want HTTPS.

Building the Docker image happens on the VM itself (`--build`), not via a
separate CI/registry step, so give the instance enough headroom for a
multi-stage pnpm build - each provider's README lists a minimum size that
comfortably clears it (generally 2 vCPU / 4GB RAM or the closest tier at
or above that).
