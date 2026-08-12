terraform {
  required_providers {
    dokku = {
      source  = "aliksend/dokku"
      version = "~> 1.0"
    }
  }
}

variable "dokku_host" {
  type        = string
  description = "SSH host of an existing Dokku installation (e.g. root@<ip>)."
}

variable "app_name" {
  type    = string
  default = "anonchat"
}

variable "domain" {
  type        = string
  description = "Fully qualified domain name, e.g. anonchat.example.com."
}

variable "session_secret" {
  type        = string
  sensitive   = true
  description = "Random session-signing secret. Generate with: openssl rand -hex 32"
}

provider "dokku" {
  ssh_host = var.dokku_host
}

resource "dokku_plugin" "postgres" {
  name = "postgres"
  url  = "https://github.com/dokku/dokku-postgres.git"
}

resource "dokku_app" "app" {
  name = var.app_name
}

# The WebSocket hub holds all connection/subscriber state in process-local
# memory (no Redis, no pub/sub — see docs/ARCHITECTURE.md). Dokku defaults
# web to 1 instance, and the storage:mount below further locks the container
# to a single host directory — but pinning explicitly removes any ambiguity.
resource "dokku_postgres" "db" {
  app      = dokku_app.app.name
  name     = "anonchat-db"
  password = var.session_secret

  depends_on = [dokku_plugin.postgres]
}

resource "dokku_postgres_link" "db_link" {
  app      = dokku_app.app.name
  postgres = dokku_postgres.db.name

  depends_on = [dokku_postgres.db]
}

resource "dokku_domain" "domain" {
  app    = dokku_app.app.name
  domain = var.domain
}

output "app_name" {
  value = dokku_app.app.name
}
