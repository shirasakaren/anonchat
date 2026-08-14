import { useEffect, useRef, useState } from "react";

interface Props {
  onDelete: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteIdentityModal({ onDelete, onCancel }: Props) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const cancelRef = useRef(onCancel);
  busyRef.current = busy;
  cancelRef.current = onCancel;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  async function remove() {
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch {
      setError("Your identity could not be deleted. Nothing was removed from this device; please try again.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onMouseDown={() => {
        if (!busy) onCancel();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-identity-title"
        aria-describedby="delete-identity-description"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-xl"
      >
        <h2 id="delete-identity-title" className="text-base font-semibold">
          Permanently delete this identity?
        </h2>
        <p id="delete-identity-description" className="mt-2 text-sm text-[var(--text-muted)]">
          This erases the conversation, messages, attachments, private note, notification email, push registration,
          sessions, and shared diagnostics. Your recovery key will no longer restore it. This cannot be undone.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Type <span className="font-mono">DELETE</span> to confirm
          <input
            ref={inputRef}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 font-mono text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--danger-fg)]">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={confirmation !== "DELETE" || busy}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete identity and data"}
          </button>
        </div>
      </div>
    </div>
  );
}
