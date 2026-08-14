import { z } from "zod";

const boolFromEnv = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters - generate with `openssl rand -hex 32`"),
  PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY: boolFromEnv,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().default("./data/uploads"),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolFromEnv,

  // "none" (default - email notifications disabled entirely), "smtp", or
  // "resend". Powers both the admin's new-message digest and the visitor's
  // optional "email me when they reply" opt-in - see docs/ARCHITECTURE.md.
  EMAIL_DRIVER: z.enum(["none", "smtp", "resend"]).default("none"),
  EMAIL_FROM: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: boolFromEnv,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),

  // Web Push is entirely inert without all three set - generate a keypair
  // with `pnpm run push:generate-vapid-keys` (apps/server/scripts). Subject
  // must be a "mailto:you@example.com" or "https://..." contact URL per the
  // VAPID spec (browsers may use it to reach the sender about abuse).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z
    .string()
    .refine(
      (value) => value.startsWith("mailto:") || value.startsWith("https://"),
      "VAPID_SUBJECT must start with mailto: or https://",
    )
    .optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  if (parsed.data.STORAGE_DRIVER === "s3") {
    const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter(
      (key) => !parsed.data[key as keyof Env],
    );
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`STORAGE_DRIVER=s3 requires: ${missing.join(", ")}`);
      process.exit(1);
    }
  }
  if (parsed.data.EMAIL_DRIVER === "smtp") {
    const missing = ["SMTP_HOST", "EMAIL_FROM"].filter((key) => !parsed.data[key as keyof Env]);
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`EMAIL_DRIVER=smtp requires: ${missing.join(", ")}`);
      process.exit(1);
    }
  }
  if (parsed.data.EMAIL_DRIVER === "resend") {
    const missing = ["RESEND_API_KEY", "EMAIL_FROM"].filter((key) => !parsed.data[key as keyof Env]);
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`EMAIL_DRIVER=resend requires: ${missing.join(", ")}`);
      process.exit(1);
    }
  }
  const vapidKeys = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
  const vapidSet = vapidKeys.filter((key) => parsed.data[key]);
  if (vapidSet.length > 0 && vapidSet.length < vapidKeys.length) {
    // eslint-disable-next-line no-console
    console.error(`Web Push requires all three of ${vapidKeys.join(", ")} to be set (or none, to disable it).`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

/** The origins this deployment accepts cross-origin requests (and WebSocket upgrades) from. */
export function corsOrigins(env: Env): string[] {
  const origins = [env.PUBLIC_URL];
  if (env.NODE_ENV === "development") origins.push("http://localhost:5173");
  return origins;
}
