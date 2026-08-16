import { useEffect } from "react";

interface Props {
  /** Whether the viewer sent this message. Deleting for everyone is only
   *  offered on the sender's own messages - for the other party's messages
   *  the only local option is "Delete for me". */
  isOwn: boolean;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onCancel: () => void;
}

/**
 * Slack/WhatsApp-style delete confirmation: a real dialog instead of the
 * browser's own `confirm()`, offering the two distinct delete scopes this
 * app actually has. "Delete for everyone" is the only one that reaches the
 * server (see MessageBubble's onDelete) - "Delete for me" only hides the
 * message in this browser (see locallyDeletedMessages.ts), since there's no
 * server-side concept of a per-participant hide for a message the other
 * side can still see.
 */
export function DeleteMessageModal({ isOwn, onDeleteForMe, onDeleteForEveryone, onCancel }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onMouseDown={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl"
      >
        <div>
          <h2 id="delete-message-title" className="text-sm font-semibold">
            Delete message?
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {isOwn ? (
              <>
                "Delete for me" only removes it from your own view on this device. "Delete for everyone" removes it
                for both of you and can't be undone.
              </>
            ) : (
              <>
                This message stays visible to the other party - deleting it only hides it from your own view on this
                device.
              </>
            )}
          </p>
        </div>

        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={onDeleteForMe}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm font-medium hover:bg-[var(--surface-muted)]"
          >
            Delete for me
          </button>
          {isOwn && (
            <button
              type="button"
              onClick={onDeleteForEveryone}
              className="rounded-lg bg-red-600 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-red-700"
            >
              Delete for everyone
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
