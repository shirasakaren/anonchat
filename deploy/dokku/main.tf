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
  description = "Random session-signing secret."
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "PostgreSQL database password (separate from SESSION_SECRET — different secrets, different threat models)."
}

provider "dokku" {
  ssh_host = var.dokku_host
}

resource "dokku_plugin" "postgres" {
  name = "postgres"
  url  = "https://github.com/dokku/dokku-postgres.git"
}

resource "dokku_app" "app" {
  app_name = var.app_name
}

resource "dokku_postgres" "db" {
  service_name = "anonchat-db"

  depends_on = [dokku_plugin.postgres]
}

resource "dokku_postgres_link" "db_link" {
  app_name     = dokku_app.app.app_name
  service_name = dokku_postgres.db.service_name

  depends_on = [dokku_postgres.db]
}

# NOTE: The dokku_domain resource's current schema in aliksend/dokku
# doesn't match the published docs — fields that the registry docs list
# as accepted are rejected by the provider at plan time. Until the
# provider stabilizes, set the domain via the CLI instead:
#   dokku domains:set anonchat anonchat.example.com
# Docs: https://dokku.com/docs/configuration/domains/

output "app_name" {
  value = dokku_app.app.app_name
}
