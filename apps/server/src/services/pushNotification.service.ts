import { isPushConfigured, sendPushToAdmin, sendPushToAnonymousUser } from "../push/index.js";
import { getSiteSettings } from "./siteSettings.service.js";

/**
 * Fires after a USER message is created - the instant-push counterpart to
 * the admin's foreground WS notification (GlobalNotifications.tsx), for
 * when the admin's tab isn't open (or the browser is closed) at all. Takes
 * the conversation row message.service.ts already fetched rather than
 * re-querying it. Payload never carries message content - see
 * docs/ARCHITECTURE.md.
 */
export async function maybeSendAdminPush(conversation: { mutedAt: Date | null }): Promise<void> {
  if (!isPushConfigured() || conversation.mutedAt) return;
  const settings = await getSiteSettings();
  if (!settings.adminPushEnabled) return;
  await sendPushToAdmin({
    title: "New message",
    body: "You have a new message in your inbox.",
    url: "/admin",
    tag: "anonchat-admin-inbox",
  });
}

/**
 * Fires after an ADMIN message is created, for any browser subscription the
 * visitor's own identity registered. Purely the visitor's own opt-in
 * (browser permission) - unlike the admin side, there's no admin-facing
 * toggle here, since the admin doesn't control whether a visitor's own
 * device gets pushed.
 */
export async function maybeSendUserPush(conversation: { anonymousUserId: string }): Promise<void> {
  if (!isPushConfigured()) return;
  const settings = await getSiteSettings();
  await sendPushToAnonymousUser(conversation.anonymousUserId, {
    title: `${settings.displayName} replied`,
    body: "Open Anonchat to read the message.",
    url: "/",
    tag: "anonchat-reply",
  });
}
