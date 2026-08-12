terraform {
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.20"
    }
  }
}

variable "region" {
  type    = string
  default = "ewr"
}

variable "plan" {
  type    = string
  default = "vc2-2c-4gb"
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

provider "vultr" {}

# Reserved IP allocated before the instance so PUBLIC_URL is known in one
# apply — no two-step dance with the assigned dynamic IP.
resource "vultr_reserved_ip" "app" {
  region  = var.region
  ip_type = "v4"
}

locals {
  cloud_init = templatefile(
    "${path.module}/../vps/cloud-init.yaml.tpl",
    {
      repo_url             = var.repo_url
      repo_branch          = var.repo_branch
      postgres_password    = var.postgres_password
      session_secret       = var.session_secret
      public_url           = var.public_url != "" ? var.public_url : "http://${vultr_reserved_ip.app.subnet}/${vultr_reserved_ip.app.subnet_size}"
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

# Single VM — one instance holds the in-process WebSocket hub state and runs
# the full docker compose stack (self-hosted Postgres + app + MinIO optional).
resource "vultr_instance" "app" {
  region    = var.region
  plan      = var.plan
  os_id     = data.vultr_os.ubuntu.id
  hostname  = "anonchat"
  user_data = local.cloud_init
}

data "vultr_os" "ubuntu" {
  filter {
    name   = "name"
    values = ["Ubuntu 24.04 LTS"]
  }
}

output "ip_address" {
  value = vultr_reserved_ip.app.subnet
}
