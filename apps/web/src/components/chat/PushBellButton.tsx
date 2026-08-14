import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { subscribeUserPush, unsubscribeUserPush } from "../../api/anonymous.js";
import {
  getExistingPushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "../../push/webPush.js";

interface Props {
  vapidPublicKey: string | null;
}

/**
 * Header icon toggling this browser's own Web Push subscription for new
 * admin replies - a bell rather than an auto-permission-prompt, since
 * firing a native permission dialog right after the (also optional) email
 * prompt in NotificationEmailPrompt.tsx would be double-prompt fatigue.
 * Hidden entirely when push isn't supported or this server has no VAPID_*
 * configured, rather than showing a button that can't do anything.
 */
export function PushBellButton({ vapidPublicKey }: Props) {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getExistingPushSubscription()
      .then((sub) => setSubscribed(sub !== null))
      .catch(() => setSubscribed(false));
  }, []);

  if (!vapidPublicKey || !isPushSupported()) return null;

  async function handleClick() {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      if (subscribed) {
        const existing = await getExistingPushSubscription();
        if (existing) {
          const result = await unsubscribeUserPush(existing.endpoint);
          if (result.unsubscribeBrowser) await unsubscribeFromPush();
        }
        setSubscribed(false);
      } else {
        const subscription = await subscribeToPush(vapidPublicKey);
        if (subscription) {
          await subscribeUserPush(subscription);
          setSubscribed(true);
        }
      }
    } catch {
      // Best-effort - the visitor can just try the button again.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      title={subscribed ? "Disable notifications" : "Enable notifications"}
      aria-label={subscribed ? "Disable notifications" : "Enable notifications"}
      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
    >
      {subscribed ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
    </button>
  );
}
