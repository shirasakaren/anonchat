import { prisma } from "../db.js";
import { loadEnv } from "../env.js";
import { isEmailConfigured, sendEmail } from "../email/index.js";
import { adminDigestEmail } from "../email/templates.js";
import { getSiteSettings } from "./siteSettings.service.js";

const SWEEP_INTERVAL_MS = 60_000;

/** Pure timing decision, split out so it's testable without mocking
 *  Prisma: has at least `intervalMinutes` elapsed since the last digest? */
export function isDigestDue(lastSentAt: Date, intervalMinutes: number, now = Date.now()): boolean {
  return now >= lastSentAt.getTime() + intervalMinutes * 60_000;
}

/**
 * Batches new-message notifications into a periodic digest instead of one
 * email per message (see docs/ARCHITECTURE.md's "why no Redis" - this is
 * the same in-process-timer approach already used for rate limiting and
 * login challenges, not a queue). Only ever emails when there's actually
 * something new to report; a disabled/unconfigured digest, or a period
 * with zero qualifying messages, does nothing.
 */
async function runDigestSweep(): Promise<void> {
  if (!isEmailConfigured()) return;
  const settings = await getSiteSettings();
  if (!settings.adminEmailDigestEnabled || !settings.adminNotificationEmail) return;

  const since = settings.lastAdminDigestSentAt;
  if (!since) {
    // First sweep since the digest was enabled (or ever run) - establish
    // the cursor now rather than counting whatever message history already
    // existed as "new".
    await prisma.siteSettings.update({ where: { id: settings.id }, data: { lastAdminDigestSentAt: new Date() } });
    return;
  }

  const env = loadEnv();
  const intervalMinutes = Math.max(settings.adminEmailDigestIntervalMinutes, env.ADMIN_DIGEST_MIN_INTERVAL_MINUTES);
  if (!isDigestDue(since, intervalMinutes)) return;

  const messages = await prisma.message.findMany({
    where: {
      senderType: "USER",
      createdAt: { gt: since },
      conversation: { mutedAt: null, deletedAt: null },
    },
    select: { conversationId: true },
  });
  if (messages.length === 0) return;

  const conversationCount = new Set(messages.map((m) => m.conversationId)).size;
  const email = adminDigestEmail({ messageCount: messages.length, conversationCount, siteUrl: env.PUBLIC_URL });
  await sendEmail({ to: settings.adminNotificationEmail, ...email });
  await prisma.siteSettings.update({ where: { id: settings.id }, data: { lastAdminDigestSentAt: new Date() } });
}

const sweepTimer = setInterval(() => {
  runDigestSweep().catch((err) => console.error("Admin digest sweep failed:", err));
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();
