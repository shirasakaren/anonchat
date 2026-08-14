/** Client-side Web Push plumbing shared by the admin (SettingsPage) and
 *  visitor (Chat.tsx bell button) subscribe flows. Neither side talks to
 *  push services directly - this only drives the browser's own
 *  ServiceWorkerRegistration/PushManager APIs; the server-side endpoint and
 *  keys get POSTed to /admin/push/subscribe or /anonymous/push/subscribe by
 *  the caller. */

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Standard VAPID-key base64url -> Uint8Array conversion required by
 *  PushManager.subscribe's applicationServerKey option. */
function urlBase64ToArrayBuffer(base64Url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js");
}

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function toSubscriptionKeys(subscription: PushSubscription): PushSubscriptionKeys {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! } };
}

/** Whether this browser already holds a push subscription (regardless of
 *  whether the server still knows about it) - used to render subscribe vs.
 *  unsubscribe UI without requesting permission just to check. */
export async function getExistingPushSubscription(): Promise<PushSubscriptionKeys | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? toSubscriptionKeys(subscription) : null;
}

/** Requests Notification permission (if not already decided) and creates a
 *  push subscription. Returns null if the browser doesn't support push or
 *  the user declines/has blocked permission - callers should treat that as
 *  "nothing to do", not an error. */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionKeys | null> {
  if (!isPushSupported()) return null;
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return null;
  }
  if (Notification.permission !== "granted") return null;

  const registration = await getRegistration();
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
    }));
  return toSubscriptionKeys(subscription);
}

/** Unsubscribes this browser and returns the endpoint that was removed, so
 *  the caller can tell the server to forget it too. Null if there was
 *  nothing to unsubscribe from. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
