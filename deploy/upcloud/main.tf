terraform {
  required_providers {
    upcloud = {
      source  = "UpCloudLtd/upcloud"
      version = "~> 5.0"
    }
  }
}

variable "zone" {
  type    = string
  default = "de-fra1"
}

variable "plan" {
  type    = string
  default = "2xCPU-4GB"
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

provider "upcloud" {}

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

# The `metadata` boolean is required for cloud-init delivery via the UpCloud
# Metadata service on recent templates. Without it, user_data is not delivered.
resource "upcloud_server" "app" {
  hostname = "anonchat"
  zone     = var.zone
  plan     = var.plan

  template {
    storage = "Ubuntu Server 24.04 LTS (Noble Numbat)"
  }

  metadata  = true
  user_data = local.cloud_init
}

output "ip_address" {
  value = upcloud_server.app.network_interface[0].ip_address
}
