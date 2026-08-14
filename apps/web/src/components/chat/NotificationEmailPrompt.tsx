import { useState } from "react";
import { X } from "lucide-react";
import { setNotificationEmail } from "../../api/anonymous.js";

interface Props {
  adminName: string;
  onDone: () => void;
}

/**
 * Shown once, right after this identity's first sent message (see Chat.tsx)
 * - entirely optional, never asks for a name, and never claims to be
 *   anything other than a one-off "email me on reply" opt-in. Dismissal is
 *   remembered per-conversation in localStorage so it doesn't reappear
 *   every session (see notificationEmailPromptDismissed.ts).
 */
export function NotificationEmailPrompt({ adminName, onDone }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setNotificationEmail(email.trim());
      onDone();
    } catch {
      setError("Couldn't save that email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center p-4 sm:justify-end">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">Get an email when {adminName} replies?</p>
          <button
            type="button"
            onClick={onDone}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Fully optional - we'll only email you when {adminName} sends a reply here. No name needed, and it's never used
          for anything else.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Notify me"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-[var(--danger-fg)]">{error}</p>}
        <button type="button" onClick={onDone} className="mt-2 text-xs text-[var(--text-muted)] hover:underline">
          No thanks
        </button>
      </div>
    </div>
  );
}
