import { useCallback, useEffect, useState } from "react";

const TAP_HINT_KEY = "anonchat:tapMessageHintDismissed";

function detectTouchUi(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches || !window.matchMedia("(min-width: 768px)").matches
  );
}

/**
 * Tap-to-select is a touch/small-screen pattern only. Desktop (mouse,
 * wide window) keeps the bubble inert - ordinary selectable text - and
 * uses the hover buttons plus the anchored dropdown instead. Detected via
 * the coarse-pointer media query OR the sub-md width, and kept reactive
 * for window resizes / dev-tools device emulation.
 */
export function useTouchUi(): boolean {
  const [touchUi, setTouchUi] = useState(detectTouchUi);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const narrow = window.matchMedia("(max-width: 767px)");
    const update = () => setTouchUi(coarse.matches || narrow.matches);
    coarse.addEventListener("change", update);
    narrow.addEventListener("change", update);
    return () => {
      coarse.removeEventListener("change", update);
      narrow.removeEventListener("change", update);
    };
  }, []);
  return touchUi;
}

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
