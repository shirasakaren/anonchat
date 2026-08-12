# Deploying Anonchat on Google Cloud (Cloud Run + Cloud SQL)

This Terraform config runs Anonchat on [Cloud Run](https://cloud.google.com/run)
(fully managed, scales to zero) backed by a
[Cloud SQL](https://cloud.google.com/sql) PostgreSQL instance, connected via
Cloud Run's built-in Cloud SQL integration (an IAM-authenticated, encrypted
tunnel - not a raw network path). Attachments are stored in a Google Cloud
Storage bucket via its S3-compatible API, since **Cloud Run containers have
no persistent local disk** - anything written to local storage is lost on
every restart, redeploy, or scale-to-zero event.

Config: [`main.tf`](./main.tf)

## Prerequisites

- A GCP project with billing enabled
- [Terraform](https://developer.hashicorp.com/terraform/install) installed
- `gcloud` CLI installed and authenticated (`gcloud auth application-default login`)
- Docker installed locally

## 1. Build and push the image to Artifact Registry

```bash
gcloud artifacts repositories create anonchat --repository-format=docker --location=us-central1
gcloud auth configure-docker us-central1-docker.pkg.dev

docker build -t us-central1-docker.pkg.dev/<project-id>/anonchat/anonchat:latest .
docker push us-central1-docker.pkg.dev/<project-id>/anonchat/anonchat:latest
```

## 2. Deploy the infrastructure

```bash
cd deploy/gcp
terraform init
terraform plan \
  -var="project_id=<project-id>" \
  -var="image=us-central1-docker.pkg.dev/<project-id>/anonchat/anonchat:latest" \
  -var="db_password=$(openssl rand -base64 24 | tr -d '=+/')" \
  -var="session_secret=$(openssl rand -hex 32)"
```

Review the plan - it creates a Cloud SQL instance, a Cloud Run service, a
Cloud Storage bucket, and supporting service accounts/IAM bindings, all real
and billable. Then apply with the same variables:

```bash
terraform apply -var="project_id=..." -var="image=..." -var="db_password=..." -var="session_secret=..."
```

Save the `db_password` and `session_secret` you generated - you'll need them
again for future `terraform apply` runs (Terraform doesn't remember values
you don't put in a `.tfvars` file). Consider writing them to a local
`terraform.tfvars` file (already gitignored) instead of retyping them.

## 3. Set PUBLIC_URL and redeploy

```bash
terraform output service_url
terraform apply -var="public_url=<output-url>" -var="project_id=..." -var="image=..." -var="db_password=..." -var="session_secret=..."
```

Visit the URL - you'll land on the first-run admin setup wizard.

## Updating after a code change

```bash
docker build -t us-central1-docker.pkg.dev/<project-id>/anonchat/anonchat:latest .
docker push us-central1-docker.pkg.dev/<project-id>/anonchat/anonchat:latest
gcloud run deploy anonchat --image us-central1-docker.pkg.dev/<project-id>/anonchat/anonchat:latest --region us-central1
```

`docker-entrypoint.sh` runs `prisma migrate deploy` automatically before the
server starts, so schema changes apply on their own.

## Costs

Cloud Run scales to zero when idle (you only pay for active requests), but
the Cloud SQL instance and Cloud Storage bucket are billed continuously.
Review current GCP pricing before applying.
