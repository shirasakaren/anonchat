#cloud-config
# Shared cloud-init template for every plain-VPS/IaaS provider template
# under deploy/ (Hetzner, DigitalOcean, Vultr, Scaleway, UpCloud, Contabo,
# OVHcloud, Akamai Connected Cloud). Non-interactive equivalent of
# scripts/setup.sh: installs Docker, writes .env, clones the repo, and
# brings up the same docker-compose.yml used for any self-hosted install.
#
# Consumed via each provider's own templating (Terraform's templatefile(),
# or a plain $${key} substitution in the matching Pulumi program). The
# substitution syntax used below is $${variable_name}; no Terraform-specific
# flow-control directives are used, so both tools can fill it in with a
# simple string replace.
#
# Variables the caller must supply:
#   repo_url, repo_branch          - this repo, e.g. https://github.com/<owner>/<repo>.git
#   postgres_password, session_secret
#   public_url                     - leave blank on first apply; the caller's
#                                     README explains how to set it once the
#                                     instance's IP/domain is known
#   storage_driver                 - "local" (default) or "s3"
#   s3_endpoint, s3_region, s3_bucket, s3_access_key_id,
#   s3_secret_access_key, s3_force_path_style - only meaningful when
#                                     storage_driver = "s3"; leave blank otherwise
#
# What this deliberately does NOT do (matches scripts/setup.sh's scope):
# no reverse proxy, no TLS/ACME, no firewall rules beyond what the caller's
# own template configures. Put Anonchat behind Caddy/nginx/a tunnel with your
# own domain for HTTPS, exactly as you would for any self-hosted VPS.

package_update: true
packages:
  - ca-certificates
  - curl
  - git

write_files:
  - path: /opt/anonchat/.env
    permissions: '0600'
    content: |
      POSTGRES_USER=anonchat
      POSTGRES_DB=anonchat
      POSTGRES_PASSWORD=${postgres_password}
      SESSION_SECRET=${session_secret}
      PUBLIC_URL=${public_url}
      NODE_ENV=production
      PORT=3000
      TRUST_PROXY=true
      STORAGE_DRIVER=${storage_driver}
      UPLOAD_DIR=/app/data/uploads
      S3_ENDPOINT=${s3_endpoint}
      S3_REGION=${s3_region}
      S3_BUCKET=${s3_bucket}
      S3_ACCESS_KEY_ID=${s3_access_key_id}
      S3_SECRET_ACCESS_KEY=${s3_secret_access_key}
      S3_FORCE_PATH_STYLE=${s3_force_path_style}

runcmd:
  - curl -fsSL https://get.docker.com | sh
  - systemctl enable --now docker
  - git clone --branch "${repo_branch}" --depth 1 "${repo_url}" /opt/anonchat/src
  - cp /opt/anonchat/.env /opt/anonchat/src/.env
  - sh -c 'cd /opt/anonchat/src && docker compose up -d --build'
