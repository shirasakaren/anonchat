import { loadEnv } from "../env.js";
import { ResendEmailAdapter } from "./resend.js";
import { SmtpEmailAdapter } from "./smtp.js";
import type { EmailAdapter, OutgoingEmail } from "./types.js";

export type { EmailAdapter, OutgoingEmail } from "./types.js";

let cached: EmailAdapter | null | undefined;

/** Returns null (not an error) when EMAIL_DRIVER=none - the default, since
 *  email notifications are entirely optional. Callers should treat a null
 *  adapter as "nothing to do", not fail the request that triggered it. */
function getEmailAdapter(): EmailAdapter | null {
  if (cached !== undefined) return cached;
  const env = loadEnv();
  if (env.EMAIL_DRIVER === "smtp") {
    cached = new SmtpEmailAdapter({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM!,
    });
  } else if (env.EMAIL_DRIVER === "resend") {
    cached = new ResendEmailAdapter(env.RESEND_API_KEY!, env.EMAIL_FROM!);
  } else {
    cached = null;
  }
  return cached;
}

/** Best-effort send: logs and swallows failures rather than throwing, since
 *  every caller is a notification path (admin digest, visitor reply email)
 *  that should never take down the request/job that triggered it just
 *  because an operator's mail config is broken. */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const adapter = getEmailAdapter();
  if (!adapter) return;
  try {
    await adapter.send(email);
  } catch (err) {
    console.error(`Failed to send notification email to ${email.to}:`, err);
  }
}

export function isEmailConfigured(): boolean {
  return getEmailAdapter() !== null;
}
