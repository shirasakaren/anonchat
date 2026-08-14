import { prisma } from "../db.js";
import { loadEnv } from "../env.js";
import { isEmailConfigured, sendEmail } from "../email/index.js";
import { replyNotificationEmail } from "../email/templates.js";
import { getSiteSettings } from "./siteSettings.service.js";

/**
 * Fires (best-effort, never throws - see sendEmail) after an admin message
 * is created, if the conversation's anonymous user opted into "email me
 * when they reply" (see anonymous.ts's notification-email route). Never
 * awaited by the send-message request path - an SMTP round trip shouldn't
 * add latency to the admin's own message send.
 */
export async function maybeSendReplyNotification(conversationId: string): Promise<void> {
  if (!isEmailConfigured()) return;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { anonymousUser: true },
  });
  const user = conversation?.anonymousUser;
  if (!user?.notificationEmail) return;

  const settings = await getSiteSettings();
  const minIntervalMs = settings.replyEmailMinIntervalMinutes * 60_000;
  if (user.notificationEmailSentAt && Date.now() - user.notificationEmailSentAt.getTime() < minIntervalMs) {
    return; // A burst of consecutive admin replies collapses into one email.
  }

  const env = loadEnv();
  const email = replyNotificationEmail({ adminName: settings.displayName, siteUrl: env.PUBLIC_URL });
  await sendEmail({ to: user.notificationEmail, ...email });
  await prisma.anonymousUser.update({ where: { id: user.id }, data: { notificationEmailSentAt: new Date() } });
}
