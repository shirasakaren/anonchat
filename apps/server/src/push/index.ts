import webpush from "web-push";
import { prisma } from "../db.js";
import { loadEnv } from "../env.js";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Web Push is entirely inert without all three VAPID_* vars set (see
 *  src/env.ts's all-or-nothing validation) - mirrors isEmailConfigured()'s
 *  "null/false means nothing to do, not an error" shape. loadEnv() is
 *  already cached, so recomputing this (and re-arming web-push's static
 *  VAPID config, which is idempotent) on every call costs nothing. */
export function isPushConfigured(): boolean {
  const env = loadEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return true;
}

/** A 404/410 means the push service has permanently discarded this
 *  subscription (browser uninstalled, endpoint expired, etc.) - the
 *  standard signal to stop sending to it, per the Web Push protocol. Any
 *  other failure is logged but the row is left alone (could be transient). */
async function deliver(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: "normal", topic: payload.tag },
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
    } else {
      console.error("Push send failed:", err);
    }
  }
}

/** Every admin-owned subscription gets the push - onboarding hard-blocks a
 *  second Admin row ever existing, so "all admin subscriptions" and "this
 *  site's one admin's subscriptions" are the same set. */
export async function sendPushToAdmin(payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { adminId: { not: null } } });
  await Promise.all(subscriptions.map((s) => deliver(s, payload)));
}

export async function sendPushToAnonymousUser(anonymousUserId: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { anonymousUserId } });
  await Promise.all(subscriptions.map((s) => deliver(s, payload)));
}
