import { useEffect, useState } from "react";
import type { CannedReplyDto } from "@anonchat/shared";
import { listCannedReplies } from "../../api/admin.js";

export function CannedReplyPicker({ onPick }: { onPick: (body: string) => void }) {
  // null = not loaded yet (distinct from "loaded, and there are none").
  const [replies, setReplies] = useState<CannedReplyDto[] | null>(null);
  const [open, setOpen] = useState(false);

  // Fetched on mount, not on open: the toggle button only rendered after
  // replies arrived, but the fetch previously only ran once `open` was true
  // - and open could only become true by clicking that button. The guard
  // below returned null on the first render, so the button never appeared
  // and canned replies were unreachable in the composer no matter how many
  // existed.
  useEffect(() => {
    listCannedReplies().then(setReplies);
  }, []);

  // Nothing to offer - keep the composer free of a dead "Canned replies"
  // toggle (a picker with zero entries is just noise).
  if (replies === null || replies.length === 0) return null;

  return (
    <div className="border-t border-[var(--border)] px-3 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-[var(--link-fg)] hover:underline"
      >
        {open ? "Hide canned replies" : "Canned replies"}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {replies.map((reply) => (
            <button
              key={reply.id}
              type="button"
              onClick={() => onPick(reply.body)}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--surface-muted)]"
            >
              {reply.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
