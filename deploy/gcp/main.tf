terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "GCP project ID to deploy into."
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "image" {
  type        = string
  description = "Full Artifact Registry image URI, e.g. us-central1-docker.pkg.dev/<project>/termine/termine:latest"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Password for the termine Postgres user."
}

variable "session_secret" {
  type        = string
  sensitive   = true
  description = "Random session-signing secret. Generate with: openssl rand -hex 32"
}

variable "public_url" {
  type        = string
  default     = ""
  description = "Public URL this app is served at. Leave blank for the first apply, then set it to the Cloud Run URL output and re-apply."
}

variable "store_ip_addresses" {
  type    = bool
  default = false
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sql" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Database
#
# Cloud Run's built-in Cloud SQL support connects through an IAM-authenticated,
# mutually-TLS-encrypted tunnel (the same mechanism as the Cloud SQL Auth
# Proxy) rather than a raw network path - the instance having a public IP
# does not mean it's open to arbitrary connections. This is Google's own
# recommended simple pattern and avoids needing a custom VPC/private
# services connection.
# ---------------------------------------------------------------------------
resource "google_sql_database_instance" "postgres" {
  name             = "termine"
  region           = var.region
  database_version = "POSTGRES_17"
  deletion_protection = true

  settings {
    tier = "db-f1-micro"
    backup_configuration {
      enabled = true
    }
  }

  depends_on = [google_project_service.sql]
}

resource "google_sql_database" "database" {
  name     = "termine"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "user" {
  name     = "termine"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# ---------------------------------------------------------------------------
# Cloud Run
# ---------------------------------------------------------------------------
resource "google_service_account" "app" {
  account_id   = "termine-app"
  display_name = "Termine Cloud Run runtime identity"
}

resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app.email}"
}

# ---------------------------------------------------------------------------
# Attachment storage
#
# Cloud Run containers have no persistent local disk - anything written to
# STORAGE_DRIVER=local's UPLOAD_DIR is lost on every restart/redeploy/scale
# event. Google Cloud Storage exposes an S3-compatible XML API, so this
# uses the app's existing S3 storage adapter against a GCS bucket instead
# of requiring a separate S3 provider account.
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "uploads" {
  name                        = "${var.project_id}-termine-uploads"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false
}

resource "google_service_account" "storage" {
  account_id   = "termine-storage"
  display_name = "Termine GCS HMAC key holder"
}

resource "google_storage_bucket_iam_member" "storage_access" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.storage.email}"
}

resource "google_storage_hmac_key" "uploads" {
  service_account_email = google_service_account.storage.email
}

resource "google_cloud_run_v2_service" "app" {
  name                = "termine"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }

    containers {
      image = var.image

      ports {
        container_port = 3000
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "DATABASE_URL"
        value = "postgresql://termine:${var.db_password}@localhost/termine?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
      }
      env {
        name  = "SESSION_SECRET"
        value = var.session_secret
      }
      env {
        name  = "PUBLIC_URL"
        value = var.public_url
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "TRUST_PROXY"
        value = "true"
      }
      env {
        name  = "STORE_IP_ADDRESSES"
        value = var.store_ip_addresses ? "true" : "false"
      }
      env {
        name  = "STORAGE_DRIVER"
        value = "s3"
      }
      env {
        name  = "S3_ENDPOINT"
        value = "https://storage.googleapis.com"
      }
      env {
        name  = "S3_REGION"
        value = "auto"
      }
      env {
        name  = "S3_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "S3_ACCESS_KEY_ID"
        value = google_storage_hmac_key.uploads.access_id
      }
      env {
        name  = "S3_SECRET_ACCESS_KEY"
        value = google_storage_hmac_key.uploads.secret
      }
      env {
        name  = "S3_FORCE_PATH_STYLE"
        value = "true"
      }
    }
  }

  depends_on = [google_project_service.run]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_url" {
  value = google_cloud_run_v2_service.app.uri
}
