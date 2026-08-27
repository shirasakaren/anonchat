import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getRecoveryPhrase } from "../../crypto/identityStore.js";
import { RecoveryPhraseDisplay } from "../common/RecoveryPhraseDisplay.js";

interface Props {
  publicId: string;
  onClose: () => void;
}

/**
 * On-demand view of the visitor's recovery key, opened from the key icon in
 * the chat header. The secret has been stored in this device's IndexedDB
 * since identity creation - this modal just re-formats it for copying, so
 * there is no save-it-now step to block first-time visitors from chatting.
 * Bottom-sheet on phones, centered dialog on larger screens.
 */
export function RecoveryKeyModal({ publicId, onClose }: Props) {
  const [phrase, setPhrase] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRecoveryPhrase(publicId)
      .then((value) => {
        if (cancelled) return;
        if (value) setPhrase(value);
        else setMissing(true);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-key-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="recovery-key-title" className="text-base font-semibold">
              Your recovery key
            </h2>
            <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">#{publicId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {missing ? (
          <p role="alert" className="text-sm text-[var(--danger-fg)]">
            This key isn't available on this device. It was created here, so if it's missing the local identity data
            was cleared.
          </p>
        ) : !phrase ? (
          <p className="p-4 text-center text-sm text-[var(--text-muted)]">Loading your key…</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              Copy this key to open the same conversation on another device, or to get back in after clearing this
              browser. <strong>Anyone with this key can read your conversation - keep it private.</strong>
            </p>
            <RecoveryPhraseDisplay phrase={phrase} filename={`anonchat-${publicId}-recovery-key.txt`} />
          </div>
        )}
      </div>
    </div>
  );
}
