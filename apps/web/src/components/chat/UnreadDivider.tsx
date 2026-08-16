/** The clear boundary between the part of the thread the viewer has already
 *  seen and everything that arrived since - WhatsApp-style "New messages"
 *  divider, rendered above the first unseen message when a conversation is
 *  reopened. */
export function UnreadDivider() {
  return (
    <div role="separator" aria-label="New messages" className="flex items-center gap-3 py-1.5">
      <div className="h-px flex-1 bg-[var(--color-accent-400)]" aria-hidden />
      <span className="rounded-full border border-[var(--color-accent-400)] px-3 py-1 text-[11px] font-semibold text-[var(--link-fg)]">
        New messages
      </span>
      <div className="h-px flex-1 bg-[var(--color-accent-400)]" aria-hidden />
    </div>
  );
}
