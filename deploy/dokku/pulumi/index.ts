import * as pulumi from "@pulumi/pulumi";

// NOTE: No native Pulumi provider exists for Dokku. This program uses
// Pulumi's dynamically-bridged Terraform provider mechanism instead.
// Generate the local SDK first:
//   pulumi package add terraform-provider registry.terraform.io/aliksend/dokku
// Then import the generated provider package below (adjust the import path
// to match the generated package name — in pulumi-dynamic-terraform-
// bridges it's typically scoped under @get/ or similar).

const config = new pulumi.Config();
const dokkuHost = config.require("dokku_host");
const appName = config.get("app_name") ?? "anonchat";
const domain = config.require("domain");
const sessionSecret = config.requireSecret("session_secret");

// Resources are provisioned via the bridged Terraform provider SDK.
// After running `pulumi package add terraform-provider ...`, replace the
// placeholder imports below with the actual generated types and uncomment:

/*
const app = new dokku.App("app", {
  name: appName,
});

const db = new dokku.Postgres("db", {
  app: app.name,
  name: "anonchat-db",
  password: sessionSecret,
});

const dbLink = new dokku.PostgresLink("db_link", {
  app: app.name,
  postgres: db.name,
});

new dokku.Domain("domain", {
  app: app.name,
  domain: domain,
});
*/

export const appName_ = appName;
