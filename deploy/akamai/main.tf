terraform {
  required_providers {
    linode = {
      source  = "linode/linode"
      version = "~> 2.30"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east"
}

variable "instance_type" {
  type    = string
  default = "g6-standard-2"
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

provider "linode" {}

locals {
  cloud_init = templatefile(
    "${path.module}/../vps/cloud-init.yaml.tpl",
    {
      repo_url             = var.repo_url
      repo_branch          = var.repo_branch
      postgres_password    = var.postgres_password
      session_secret       = var.session_secret
      public_url           = var.public_url
      storage_driver       = var.storage_driver
      s3_endpoint          = var.s3_endpoint
      s3_region            = var.s3_region
      s3_bucket            = var.s3_bucket
      s3_access_key_id     = var.s3_access_key_id
      s3_secret_access_key = var.s3_secret_access_key
      s3_force_path_style  = var.s3_force_path_style
    }
  )
}

# Single Linode VM — the compose file's own PostgreSQL container is the
# database story. The Metadata service delivers cloud-init; it's not enabled
# in every Linode region — use a supported region (e.g. us-east).
resource "linode_instance" "app" {
  label  = "anonchat"
  region = var.region
  type   = var.instance_type
  image  = "linode/ubuntu24.04"

  metadata {
    user_data = base64encode(local.cloud_init)
  }
}

output "ip_address" {
  value = linode_instance.app.ip_address
}
