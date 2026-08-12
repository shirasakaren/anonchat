terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.40"
    }
  }
}

variable "zone" {
  type    = string
  default = "fr-par-1"
}

variable "instance_type" {
  type    = string
  default = "DEV1-M"
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

provider "scaleway" {
  zone = var.zone
}

locals {
  rendered_cloud_init = templatefile(
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

# Scaleway's user_data is a MAP with a reserved key "cloud-init" — NOT a
# plain string like AWS/DO/Hetzner. Getting this wrong is the most common
# Scaleway provider mistake. The templatefile() result (a multi-line string
# of valid cloud-init YAML) is the value for that one key.
resource "scaleway_instance_server" "app" {
  name  = "anonchat"
  type  = var.instance_type
  image = "ubuntu-jammy"

  user_data = {
    "cloud-init" = local.rendered_cloud_init
  }
}

# Two-step apply: deploy first, grab the instance's public IP from the output
# below, then re-apply with PUBLIC_URL set to http://<that-ip>.
output "ip_address" {
  value = scaleway_instance_server.app.public_ips[0]
}
