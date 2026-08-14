import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}

export function UnsavedMediaOrderModal({ saving, onSave, onDiscard, onKeepEditing }: Props) {
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    keepEditingRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onKeepEditing();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onKeepEditing, saving]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onMouseDown={() => {
        if (!saving) onKeepEditing();
      }}
      role="presentation"
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-media-order-title"
        aria-describedby="unsaved-media-order-description"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--warning-bg)] text-[var(--warning-fg)]">
            <AlertTriangle size={18} aria-hidden />
          </span>
          <div>
            <h2 id="unsaved-media-order-title" className="font-semibold">
              Save your media order?
            </h2>
            <p id="unsaved-media-order-description" className="mt-1 text-sm text-[var(--text-muted)]">
              Your new media order has not been saved. Save it before leaving, or discard the rearrangement.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={keepEditingRef}
            type="button"
            onClick={onKeepEditing}
            disabled={saving}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm font-semibold text-[var(--danger-fg)] disabled:opacity-50"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  );
}
