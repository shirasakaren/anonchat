# The Koyeb Terraform provider (koyeb/koyeb v0.1.x) is too immature
# at this writing for a validated module — its resource schemas for
# koyeb_service change between minor versions and lack documentation
# for several blocks that are required by the provider but not yet
# published in the registry docs.
#
# Use the deploy-button URL documented in deploy/koyeb/README.md as
# the primary deploy path. The koyeb.yaml app-manifest is the
# infrastructure-as-code alternative for CLI-driven deploys.
#
# When the provider stabilizes, the intended resource graph is:
#   koyeb_app + koyeb_service (Dockerfile + GitHub source, port 3000,
#   pinned to 1 instance, health check on /health) + env vars.
terraform {
  required_providers {
    koyeb = {
      source  = "koyeb/koyeb"
      version = "~> 0.1"
    }
  }
}
