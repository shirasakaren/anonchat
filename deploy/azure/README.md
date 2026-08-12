# Deploying Anonchat on Azure (Container Apps + PostgreSQL)

This Bicep template runs Anonchat on [Azure Container Apps](https://azure.microsoft.com/en-us/products/container-apps)
backed by [Azure Database for PostgreSQL Flexible Server](https://azure.microsoft.com/en-us/products/postgresql).

Template: [`main.bicep`](./main.bicep) - validated with `az bicep build` (compiles cleanly, no Azure credentials required for that step).

## Prerequisites

- An Azure subscription
- `az` CLI installed and logged in (`az login`)
- Docker installed locally
- An S3-compatible storage provider for attachments (Cloudflare R2, AWS S3, or Backblaze B2) - see the note on attachment storage below

## 1. Create a resource group and push the image to ACR

```bash
az group create --name anonchat-rg --location eastus

az acr create --resource-group anonchat-rg --name <registryname> --sku Basic
az acr login --name <registryname>

docker build -t <registryname>.azurecr.io/anonchat:latest .
docker push <registryname>.azurecr.io/anonchat:latest

az acr update --name <registryname> --admin-enabled true
```

## 2. Deploy the infrastructure

```bash
az deployment group create \
  --resource-group anonchat-rg \
  --template-file deploy/azure/main.bicep \
  --parameters \
    image=<registryname>.azurecr.io/anonchat:latest \
    dbPassword="$(openssl rand -base64 24 | tr -d '=+/')" \
    sessionSecret="$(openssl rand -hex 32)"
```

This provisions real, billable Azure resources: a Container Apps environment,
a Container App, and a PostgreSQL Flexible Server.

If your registry requires authentication (it does, once `admin-enabled` is
set), attach registry credentials to the Container App after the first
deploy via the Azure Portal or:

```bash
az containerapp registry set \
  --name anonchat --resource-group anonchat-rg \
  --server <registryname>.azurecr.io \
  --username <registryname> \
  --password "$(az acr credential show --name <registryname> --query passwords[0].value -o tsv)"
```

## 3. Configure attachment storage

Azure Container Apps has no persistent local disk by default, and Azure Blob
Storage isn't S3-API-compatible, so this template targets an external
S3-compatible provider instead:

```bash
az containerapp update --name anonchat --resource-group anonchat-rg --set-env-vars \
  STORAGE_DRIVER=s3 \
  S3_ENDPOINT=<endpoint> \
  S3_BUCKET=<bucket> \
  S3_ACCESS_KEY_ID=<key> \
  S3_SECRET_ACCESS_KEY=<secret> \
  S3_FORCE_PATH_STYLE=true
```

**Want everything on Azure instead?** Container Apps does support a
persistent volume via an Azure Files (SMB) share mounted at the environment
level. That requires a storage account, a file share, and an
`Microsoft.App/managedEnvironments/storages` resource wired into the
container's `volumeMounts` - not included in this template to keep it
reviewable, but straightforward to add if you'd rather avoid a third-party
storage provider. See the [Azure Container Apps storage mounts docs](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts).

## 4. Set PUBLIC_URL and redeploy

```bash
az deployment group show --resource-group anonchat-rg --name main --query "properties.outputs.appUrl.value" -o tsv
az containerapp update --name anonchat --resource-group anonchat-rg --set-env-vars PUBLIC_URL=<that-url>
```

Visit the URL - you'll land on the first-run admin setup wizard.

## Updating after a code change

```bash
docker build -t <registryname>.azurecr.io/anonchat:latest .
docker push <registryname>.azurecr.io/anonchat:latest
az containerapp update --name anonchat --resource-group anonchat-rg --image <registryname>.azurecr.io/anonchat:latest
```

`docker-entrypoint.sh` runs `prisma migrate deploy` automatically before the
server starts, so schema changes apply on their own.

## Costs

The Container Apps environment, the running app, and the PostgreSQL Flexible
Server are all billable Azure resources. Review current Azure pricing for
your region before deploying.
