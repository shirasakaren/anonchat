@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Full container image reference, e.g. myregistry.azurecr.io/termine:latest')
param image string

@secure()
@minLength(12)
param dbPassword string

@secure()
@minLength(32)
param sessionSecret string

@description('Public URL this app is served at. Leave blank for the first deploy, then set it to the Container App\'s FQDN and redeploy.')
param publicUrl string = ''

param storeIpAddresses bool = false

var namePrefix = 'termine'

// ---------------------------------------------------------------------------
// Container Apps environment (required host for the app)
// ---------------------------------------------------------------------------
module environment 'br/public:avm/res/app/managed-environment:0.11.2' = {
  name: 'termine-environment'
  params: {
    name: '${namePrefix}-env'
    location: location
    zoneRedundant: false
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
module postgres 'br/public:avm/res/db-for-postgre-sql/flexible-server:0.11.0' = {
  name: 'termine-postgres'
  params: {
    name: '${namePrefix}-db-${uniqueString(resourceGroup().id)}'
    location: location
    availabilityZone: ''
    skuName: 'Standard_B1ms'
    tier: 'Burstable'
    administratorLogin: 'termine'
    administratorLoginPassword: dbPassword
    version: '16'
    storageSizeGB: 32
    databases: [
      {
        name: 'termine'
      }
    ]
    firewallRules: [
      {
        // The well-known 0.0.0.0-0.0.0.0 range is Azure's documented special
        // case meaning "allow other Azure services" - not the public internet.
        name: 'AllowAzureServices'
        startIpAddress: '0.0.0.0'
        endIpAddress: '0.0.0.0'
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// App
//
// Attachments: Container Apps has no S3-compatible native storage the way
// Cloud Run/GCS does, and wiring a persistent Azure Files SMB mount adds
// several more interdependent resources. The straightforward path here is
// an external S3-compatible provider (Cloudflare R2, AWS S3, Backblaze B2) -
// see deploy/azure/README.md for the Azure Files alternative if you want
// everything on Azure.
// ---------------------------------------------------------------------------
module app 'br/public:avm/res/app/container-app:0.19.0' = {
  name: 'termine-app'
  params: {
    name: namePrefix
    location: location
    environmentResourceId: environment.outputs.resourceId
    ingressExternal: true
    ingressTargetPort: 3000
    ingressTransport: 'http'
    containers: [
      {
        name: 'app'
        image: image
        resources: {
          cpu: 1
          memory: '2Gi'
        }
        env: [
          {
            name: 'DATABASE_URL'
            value: 'postgresql://termine:${dbPassword}@${postgres.outputs.fqdn}:5432/termine?sslmode=require'
          }
          {
            name: 'SESSION_SECRET'
            value: sessionSecret
          }
          {
            name: 'PUBLIC_URL'
            value: publicUrl
          }
          {
            name: 'NODE_ENV'
            value: 'production'
          }
          {
            name: 'PORT'
            value: '3000'
          }
          {
            name: 'TRUST_PROXY'
            value: 'true'
          }
          {
            name: 'STORE_IP_ADDRESSES'
            value: storeIpAddresses ? 'true' : 'false'
          }
          {
            name: 'STORAGE_DRIVER'
            value: 's3'
          }
        ]
      }
    ]
  }
}

output appUrl string = 'https://${app.outputs.fqdn}'
output dbFqdn string = postgres.outputs.fqdn
