terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.40"
    }
  }
}

variable "region" {
  type    = string
  default = "nyc1"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository in owner/repo format."
}

variable "branch" {
  type    = string
  default = "main"
}

variable "session_secret" {
  type        = string
  sensitive   = true
  description = "Random session-signing secret."
}

variable "public_url" {
  type    = string
  default = ""
}

provider "digitalocean" {}

resource "digitalocean_database_cluster" "db" {
  name       = "anonchat-db"
  engine     = "pg"
  version    = "17"
  size       = "db-s-1vcpu-1gb"
  region     = var.region
  node_count = 1
}

# App Platform service. instance_count is pinned to 1 because the WebSocket
# hub holds all state in process-local memory — a second concurrent instance
# would silently split chat delivery. Do not scale beyond 1.
# Persistent volumes don't exist on App Platform, so STORAGE_DRIVER=s3 is
# mandatory; wire a Spaces bucket (not provisioned in this module — create it
# manually or extend with a digitalocean_spaces_bucket resource).
resource "digitalocean_app" "app" {
  spec {
    name   = "anonchat"
    region = var.region

    service {
      name               = "app"
      instance_count     = 1
      instance_size_slug = "basic-xxs"
      dockerfile_path    = "Dockerfile"

      source_dir = "/"

      github {
        repo           = var.github_repo
        branch         = var.branch
        deploy_on_push = true
      }

      health_check {
        http_path             = "/health"
        initial_delay_seconds = 30
        period_seconds        = 15
        timeout_seconds       = 5
      }

      env {
        key   = "DATABASE_URL"
        value = "{{db.DATABASE_URL}}"
        type  = "SECRET"
      }
      env {
        key   = "SESSION_SECRET"
        value = var.session_secret
        type  = "SECRET"
      }
      env {
        key   = "PUBLIC_URL"
        value = var.public_url
        scope = "RUN_AND_BUILD_TIME"
      }
      env {
        key   = "NODE_ENV"
        value = "production"
      }
      env {
        key   = "TRUST_PROXY"
        value = "true"
      }
      env {
        key   = "STORAGE_DRIVER"
        value = "s3"
      }
    }

    database {
      name       = "db"
      engine     = "PG"
      version    = "17"
      production = false
      cluster_name = digitalocean_database_cluster.db.name
    }
  }
}

output "app_url" {
  value = digitalocean_app.app.live_url
}
