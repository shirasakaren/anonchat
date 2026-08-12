terraform {
  required_providers {
    ovh = {
      source  = "ovh/ovh"
      version = "~> 1.0"
    }
  }
}

variable "service_name" {
  type        = string
  description = "OVHcloud Public Cloud project (service) ID."
}

variable "region" {
  type    = string
  default = "GRA11"
}

variable "flavor_id" {
  type    = string
  default = "b2-7"
}

variable "repo_url" {
  type    = string
  default = "https://github.com/<owner>/<repo>.git"
}

variable "repo_branch" {
  type    = string
  default = "main"
}

variable "postgres_password" {
  type      = string
  sensitive = true
}

variable "session_secret" {
  type      = string
  sensitive = true
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

provider "ovh" {}

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

# Single VM — the compose file's own PostgreSQL container is the database
# story. OVH Public Cloud instances have real persistent local storage; no
# separate block volume attach is needed for uploads/Postgres volumes.
# The ovh/ovh provider's volume resource has no instance attach capability —
# OVH's own docs use the separate OpenStack provider for that, which we
# deliberately skip to keep this template simple.
resource "ovh_cloud_project_instance" "app" {
  service_name = var.service_name
  region       = var.region
  name         = "anonchat"

  billing_period = "hourly"

  flavor {
    flavor_id = var.flavor_id
  }

  boot_from {
    # OVHcloud Ubuntu 24.04 (Noble) generic image. Image IDs are per-region;
    # verify this is current for your target region in the OVHcloud console
    # or API (GET /cloud/project/{serviceName}/image) before applying.
    image_id = "7d4d6e02-f23f-4e0a-8822-6e5e6d96c3bb"
  }

  network {
    public = true
  }

  user_data = local.cloud_init
}

output "ip_address" {
  value = one(ovh_cloud_project_instance.app.addresses).ip
}
