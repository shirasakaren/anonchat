import { useEffect, useRef, useState } from "react";
import { ShieldCheck, ShieldQuestion, X } from "lucide-react";
import type { PublicSiteInfoDto, VisitorInsightsStatusDto } from "@anonchat/shared";
import { consentToVisitorInsights, getVisitorInsightsStatus, revokeVisitorInsights } from "../../api/anonymous.js";
import { collectBrowserDiagnostics } from "../../visitorInsights/browserDiagnostics.js";

interface Props {
  conversationId: string;
  config: PublicSiteInfoDto["visitorInsights"];
}

function dismissalKey(conversationId: string): string {
  return `anonchat:visitor-insights-dismissed:${conversationId}`;
}

export function VisitorInsightsControl({ conversationId, config }: Props) {
  const [status, setStatus] = useState<VisitorInsightsStatusDto | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!config.enabled) return;
    void getVisitorInsightsStatus()
      .then((next) => {
        setStatus(next);
        if (!next.consentedAt && localStorage.getItem(dismissalKey(conversationId)) !== "1") setOpen(true);
      })
      .catch(() => {});
  }, [config.enabled, conversationId]);

  // Focus and Escape handling while the popup is open, matching the other
  // dialogs in the app (focus the primary action, Escape dismisses, focus
  // returns to whatever opened the popup on close).
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    primaryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        dismiss();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!config.enabled) return null;

  async function share() {
    setBusy(true);
    setError(null);
    try {
      await consentToVisitorInsights(collectBrowserDiagnostics());
      const next = await getVisitorInsightsStatus();
      setStatus(next);
      localStorage.removeItem(dismissalKey(conversationId));
      setOpen(false);
    } catch {
      setError("Couldn't share diagnostics. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await revokeVisitorInsights();
      setStatus({ enabled: true, consentedAt: null, expiresAt: null });
      localStorage.setItem(dismissalKey(conversationId), "1");
      setOpen(false);
    } catch {
      setError("Couldn't delete the shared diagnostics. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(dismissalKey(conversationId), "1");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={status?.consentedAt ? "Manage shared diagnostics" : "Diagnostics privacy"}
        aria-label={status?.consentedAt ? "Manage shared diagnostics" : "Diagnostics privacy"}
        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
      >
        {status?.consentedAt ? <ShieldCheck size={18} aria-hidden /> : <ShieldQuestion size={18} aria-hidden />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={() => {
            if (!busy) dismiss();
          }}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="visitor-insights-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 id="visitor-insights-title" className="text-sm font-semibold">
                  Share optional device diagnostics?
                </h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  This can help the site owner understand context and troubleshoot delivery. Chat content remains
                  end-to-end encrypted.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                className="rounded p-1 text-[var(--text-muted)]"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-[var(--text-muted)]">
              <li>Browser, operating system, device class, screen size, language, timezone, and network quality.</li>
              {config.collectsIpAddress && <li>IP address for abuse context.</li>}
              {config.coarseGeolocation && <li>Approximate city/region and network provider derived from that IP.</li>}
              <li>Automatically deleted after {config.retentionDays} days; you can delete it sooner here.</li>
            </ul>
            <p className="mb-3 rounded-lg bg-[var(--surface-muted)] p-2 text-xs text-[var(--text-muted)]">
              Never collected: exact GPS, contacts, browsing history, canvas/font fingerprints, or decrypted messages.
            </p>
            {status?.consentedAt ? (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => void revoke()}
                disabled={busy}
                className="rounded-lg border border-[var(--danger-fg)] px-3 py-2 text-xs font-semibold text-[var(--danger-fg)] disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete my shared diagnostics"}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={() => void share()}
                  disabled={busy}
                  className="rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-xs font-semibold text-[var(--btn-fg)] disabled:opacity-50"
                >
                  {busy ? "Sharing…" : "Share diagnostics"}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs"
                >
                  Not now
                </button>
              </div>
            )}
            {error && <p className="mt-2 text-xs text-[var(--danger-fg)]">{error}</p>}
          </section>
        </div>
      )}
    </>
  );
}
