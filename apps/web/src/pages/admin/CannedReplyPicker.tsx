import { useEffect, useState } from "react";
import type { CannedReplyDto } from "@termine/shared";
import { listCannedReplies } from "../../api/admin.js";

export function CannedReplyPicker({ onPick }: { onPick: (body: string) => void }) {
  const [replies, setReplies] = useState<CannedReplyDto[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && replies.length === 0) {
      listCannedReplies().then(setReplies);
    }
  }, [open, replies.length]);

  if (replies.length === 0 && !open) return null;

  return (
    <div className="border-t border-[var(--border)] px-3 py-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-[var(--color-accent-600)]">
        {open ? "Hide canned replies" : "Canned replies"}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {replies.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No canned replies yet. Add some in Settings.</p>
          ) : (
            replies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                onClick={() => onPick(reply.body)}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--surface-muted)]"
              >
                {reply.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
