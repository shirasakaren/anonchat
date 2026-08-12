terraform {
  required_providers {
    contabo = {
      source  = "contabo/contabo"
      version = "~> 0.1"
    }
  }
}

variable "region" {
  type    = string
  default = "EU"
}

variable "product_id" {
  type        = string
  default     = "VPS-XL"
  description = "Contabo VPS plan. At least 4GB RAM recommended for the on-VM Docker build."
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

provider "contabo" {}

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

# Single VM — the compose file's own PostgreSQL container is the only database
# option (Contabo has no managed Postgres product). Contabo VPS plans include
# fixed local NVMe/SSD storage — no separate block volume is needed or
# available via Terraform (the provider has no volume resource at all).
resource "contabo_instance" "app" {
  display_name = "anonchat"
  region       = var.region
  product_id   = var.product_id
  image_id     = "Ubuntu-24.04"
  period       = 1
  user_data    = local.cloud_init
}

output "ip_address" {
  value = contabo_instance.app.ip_config[0]
}
