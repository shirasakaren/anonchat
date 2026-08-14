import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Mail, X } from "lucide-react";
import {
  getNotificationPreferences,
  setNotificationEmail,
  subscribeUserPush,
  unsubscribeUserPush,
} from "../../api/anonymous.js";
import {
  getExistingPushSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "../../push/webPush.js";

interface Props {
  vapidPublicKey: string | null;
  emailAvailable: boolean;
}

export function NotificationPreferencesButton({ vapidPublicKey, emailAvailable }: Props) {
  const pushAvailable = Boolean(vapidPublicKey) && isPushSupported();
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([
      pushAvailable ? getExistingPushSubscription() : Promise.resolve(null),
      emailAvailable ? getNotificationPreferences() : Promise.resolve(null),
    ]).then(([subscription, preferences]) => {
      setPushEnabled(subscription !== null);
      const savedEmail = preferences?.notificationEmail ?? "";
      setEmail(savedEmail);
      setEmailEnabled(Boolean(savedEmail));
    });
  }, [emailAvailable, pushAvailable]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  if (!pushAvailable && !emailAvailable) return null;

  async function togglePush() {
    if (!vapidPublicKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pushEnabled) {
        const existing = await getExistingPushSubscription();
        if (existing) {
          const result = await unsubscribeUserPush(existing.endpoint);
          if (result.unsubscribeBrowser) await unsubscribeFromPush();
        }
        setPushEnabled(false);
      } else {
        const subscription = await subscribeToPush(vapidPublicKey);
        if (!subscription) throw new Error("Browser permission was not granted.");
        await subscribeUserPush(subscription);
        setPushEnabled(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Push notifications could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setNotificationEmail(emailEnabled ? email.trim() : "");
      if (!emailEnabled) setEmail("");
    } catch {
      setError("Email notifications could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const anythingEnabled = pushEnabled || emailEnabled;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Notification preferences"
        aria-label="Notification preferences"
        aria-expanded={open}
        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
      >
        {anythingEnabled ? <BellRing size={18} aria-hidden /> : <Bell size={18} aria-hidden />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Choose how to hear about new replies.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notification preferences"
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            >
              <X size={15} aria-hidden />
            </button>
          </div>

          {pushAvailable && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] p-3">
              <div>
                <p className="text-sm font-medium">Browser push</p>
                <p className="text-xs text-[var(--text-muted)]">Works even when this tab is closed.</p>
              </div>
              <button
                type="button"
                onClick={() => void togglePush()}
                disabled={busy}
                className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {pushEnabled ? "Turn off" : "Turn on"}
              </button>
            </div>
          )}

          {emailAvailable && (
            <form onSubmit={saveEmail} className="rounded-xl bg-[var(--surface-muted)] p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(event) => setEmailEnabled(event.target.checked)}
                  className="accent-[var(--color-accent-500)]"
                />
                <Mail size={15} aria-hidden />
                Email replies
              </label>
              {emailEnabled && (
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
                />
              )}
              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-lg bg-[var(--btn-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--btn-fg)] disabled:opacity-50"
              >
                Save email preference
              </button>
            </form>
          )}

          {error && (
            <p className="mt-2 text-xs text-[var(--danger-fg)]" role="alert">
              {error}
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Message content stays end-to-end encrypted and is never included in notifications.
          </p>
        </div>
      )}
    </div>
  );
}
