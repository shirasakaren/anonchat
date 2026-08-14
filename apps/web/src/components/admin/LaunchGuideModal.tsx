import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";

interface Props {
  adminName: string;
  onClose: () => void;
}

function privateWindowGuidance(): string {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (mobile) {
    if (/Firefox/i.test(ua)) return "Open Firefox's tab menu and choose Private tab.";
    if (/iPhone|iPad|iPod/i.test(ua)) return "Open Safari's tab view, choose Private, then paste the link.";
    return "Open your browser menu, choose New incognito tab, then paste the link.";
  }

  const modifier = /Macintosh|Mac OS X/i.test(ua) ? "Command" : "Ctrl";
  if (/Firefox/i.test(ua)) return `Open a private window with ${modifier} + Shift + P, then paste the link.`;
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua)) {
    return "In Safari, choose File, then New Private Window, or press Command + Shift + N.";
  }
  if (/Edg/i.test(ua)) return `Open an InPrivate window with ${modifier} + Shift + N, then paste the link.`;
  if (/OPR|Opera/i.test(ua)) return `Open a private window with ${modifier} + Shift + N, then paste the link.`;
  if (/Brave/i.test(ua)) return `Open a private window with ${modifier} + Shift + N, then paste the link.`;
  return `Open an incognito window with ${modifier} + Shift + N, then paste the link.`;
}

export function LaunchGuideModal({ adminName, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const publicUrl = useMemo(() => new URL("/", window.location.origin).href, []);
  const shareText = `Send me an anonymous, encrypted message on Anonchat.`;
  const encodedUrl = encodeURIComponent(publicUrl);
  const encodedText = encodeURIComponent(shareText);

  useEffect(() => {
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    if (!("share" in navigator)) return;
    await navigator.share({ title: "Anonchat", text: shareText, url: publicUrl }).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-guide-title"
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--link-fg)]">Your inbox is ready</p>
            <h2 id="launch-guide-title" className="mt-1 text-xl font-semibold">
              Try your anonymous chat
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close getting started guide"
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="mt-3 text-sm text-[var(--text-muted)]">
          See what visitors experience by sending {adminName} a test message from a private browser window. Your admin
          session will stay separate.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-muted)] p-2">
          <input
            readOnly
            value={publicUrl}
            aria-label="Shareable anonymous chat link"
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-xs font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3">
          <p className="text-xs font-semibold">Open it privately</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{privateWindowGuidance()}</p>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-raised)]"
          >
            <ExternalLink size={14} aria-hidden />
            Copy link for private window
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">Share your link</p>
          <div className="flex flex-wrap gap-2">
            {"share" in navigator ? (
              <button
                type="button"
                onClick={() => void nativeShare()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)]"
              >
                <Share2 size={14} aria-hidden />
                Share
              </button>
            ) : null}
            <a
              href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)]"
            >
              X
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)]"
            >
              Facebook
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)]"
            >
              LinkedIn
            </a>
            <a
              href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)]"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
