import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

/**
 * Railway infrastructure-as-code for Termine.
 *
 * This declares the target state of a Railway project: a managed Postgres
 * database and one app service built from this repo's root Dockerfile
 * (Railway auto-detects it - no separate build/start command needed).
 * Database migrations run automatically on container start via
 * docker-entrypoint.sh, so no preDeployCommand is needed here either.
 *
 * This file describes intent only - nothing is provisioned until you run
 * `railway config apply` yourself (see deploy/railway/README.md).
 */
export default defineRailway(() => {
  const db = postgres("postgres");

  const app = service("app", {
    // Replace with this repository's own owner/name once pushed to GitHub.
    source: github("<owner>/<repo>", { branch: "main" }),
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      // Generate with: openssl rand -hex 32
      SESSION_SECRET: preserve(),
      // Set this to your Railway-assigned or custom domain after the first
      // deploy (a service can't know its own public URL before it exists).
      PUBLIC_URL: preserve(),
      NODE_ENV: "production",
      TRUST_PROXY: "true",
      STORE_IP_ADDRESSES: "false",
      STORAGE_DRIVER: "local",
      UPLOAD_DIR: "/app/data/uploads",
    },
    volumeMounts: {
      "/app/data/uploads": volume("uploads", { sizeMB: 2048 }),
    },
  });

  return project("termine", {
    resources: [db, app],
  });
});
