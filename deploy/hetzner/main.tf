terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

variable "location" {
  type        = string
  default     = "nbg1"
  description = "Hetzner datacenter location."
}

variable "server_type" {
  type    = string
  default = "cx22"
}

variable "repo_url" {
  type        = string
  default     = "https://github.com/<owner>/<repo>.git"
  description = "Git clone URL for this repo."
}

variable "repo_branch" {
  type    = string
  default = "main"
}

variable "postgres_password" {
  type        = string
  sensitive   = true
  description = "Password for the self-hosted PostgreSQL container."
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

variable "storage_driver" {
  type    = string
  default = "local"
}

variable "s3_endpoint" {
  type    = string
  default = ""
}
variable "s3_region" {
  type    = string
  default = "auto"
}
variable "s3_bucket" {
  type    = string
  default = ""
}
variable "s3_access_key_id" {
  type    = string
  default = ""
}
variable "s3_secret_access_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "s3_force_path_style" {
  type    = string
  default = "true"
}

provider "hcloud" {}

# Floating IP allocated before the server so PUBLIC_URL is known in one apply.
resource "hcloud_floating_ip" "app" {
  type     = "ipv4"
  home_location = var.location
}

locals {
  cloud_init = templatefile(
    "${path.module}/../vps/cloud-init.yaml.tpl",
    {
      repo_url            = var.repo_url
      repo_branch         = var.repo_branch
      postgres_password   = var.postgres_password
      session_secret      = var.session_secret
      public_url          = var.public_url != "" ? var.public_url : "http://${hcloud_floating_ip.app.ip_address}"
      storage_driver      = var.storage_driver
      s3_endpoint         = var.s3_endpoint
      s3_region           = var.s3_region
      s3_bucket           = var.s3_bucket
      s3_access_key_id    = var.s3_access_key_id
      s3_secret_access_key = var.s3_secret_access_key
      s3_force_path_style = var.s3_force_path_style
    }
  )
}

# Single VM — one instance holds the in-process WebSocket hub state, and the
# compose file's own postgres container is the database story (Hetzner has no
# managed Postgres product).
resource "hcloud_server" "app" {
  name        = "anonchat"
  server_type = var.server_type
  location    = var.location
  image       = "ubuntu-24.04"
  user_data   = local.cloud_init
  ssh_keys    = []
}

resource "hcloud_floating_ip_assignment" "app" {
  floating_ip_id = hcloud_floating_ip.app.id
  server_id      = hcloud_server.app.id
}

output "ip_address" {
  value = hcloud_floating_ip.app.ip_address
}

output "public_url" {
  value = var.public_url != "" ? var.public_url : "http://${hcloud_floating_ip.app.ip_address}"
}
