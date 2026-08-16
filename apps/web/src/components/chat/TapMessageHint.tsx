import { useCallback, useState } from "react";

const TAP_HINT_KEY = "anonchat:tapMessageHintDismissed";

/**
 * One-time discoverability hint for the tap-a-message interaction: shown
 * in the first conversation that has messages, and dismissed forever once
 * the person taps any message (or until storage is cleared). Never shown
 * permanently - the pressed-state feedback on every bubble takes over
 * from there.
 */
export function useTapMessageHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(TAP_HINT_KEY) === "1");
  const dismissHint = useCallback(() => {
    localStorage.setItem(TAP_HINT_KEY, "1");
    setDismissed(true);
  }, []);
  return { showHint: !dismissed, dismissHint };
}

export function TapMessageHint() {
  return (
    <div
      aria-hidden
      className="pointer-events-none mx-auto my-3 w-fit animate-pulse rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-xs text-[var(--text-muted)] shadow-sm"
    >
      Tap a message for more options
    </div>
  );
}
