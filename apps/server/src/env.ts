import { z } from "zod";
import {
  DEFAULT_MAX_ATTACHMENT_SIZE_MB,
  DEFAULT_MAX_ATTACHMENTS_PER_MESSAGE,
  DEFAULT_MAX_MESSAGE_LENGTH,
  DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES,
  DEFAULT_RATE_LIMIT_LINK_PREVIEWS_PER_MINUTE,
  DEFAULT_RATE_LIMIT_MESSAGES_PER_MINUTE,
  DEFAULT_RATE_LIMIT_REGISTRATIONS_PER_HOUR,
} from "@anonchat/shared";

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

  STORE_IP_ADDRESSES: boolFromEnv,
  MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().default(DEFAULT_MAX_MESSAGE_LENGTH),
  MAX_ATTACHMENT_SIZE_MB: z.coerce.number().int().positive().default(DEFAULT_MAX_ATTACHMENT_SIZE_MB),
  MAX_ATTACHMENTS_PER_MESSAGE: z.coerce.number().int().positive().default(DEFAULT_MAX_ATTACHMENTS_PER_MESSAGE),
  MESSAGE_EDIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES),

  RATE_LIMIT_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(DEFAULT_RATE_LIMIT_MESSAGES_PER_MINUTE),
  RATE_LIMIT_REGISTRATIONS_PER_HOUR: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_REGISTRATIONS_PER_HOUR),
  RATE_LIMIT_LINK_PREVIEWS_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_LINK_PREVIEWS_PER_MINUTE),

  /** Operator escape hatch: rendering a link preview means the server
   *  fetches the shared URL on the caller's behalf (SSRF-guarded, see
   *  security/ssrfGuard.ts) - a deliberate, narrow exception to this app's
   *  "server never makes outbound requests based on message content" norm.
   *  Off by default is arguably more consistent with the rest of this
   *  app's stance, but on-by-default matches what every mainstream
   *  messenger does and is what most self-hosters will expect; operators
   *  who'd rather the server never originate outbound requests can disable it. */
  LINK_PREVIEWS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),

  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

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

  // Floor on how often the admin digest can fire, regardless of the
  // per-admin interval set in Settings - keeps a misconfigured very-low
  // interval from turning into a mail flood.
  ADMIN_DIGEST_MIN_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),

  // Floor on how often a single visitor can be emailed "you have a reply" -
  // a burst of consecutive admin replies collapses into one email instead
  // of one per message.
  REPLY_EMAIL_MIN_INTERVAL_MINUTES: z.coerce.number().int().positive().default(2),

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
