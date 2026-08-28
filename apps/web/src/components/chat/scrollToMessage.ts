const HIGHLIGHT_MS = 1600;
const HIGHLIGHT_CLASS = "message-jump-highlight";

/**
 * Scrolls a message row into view and briefly highlights it - used when a
 * reply preview (in the composer's active banner, or the quoted chip above
 * a sent message) is clicked to jump back to what it replied to. The full
 * conversation history is always loaded client-side (see Chat.tsx /
 * ConversationView.tsx), so the target row is already in the DOM; no
 * fetch-more-history step is needed here.
 */
export function scrollToMessage(id: string): void {
  const el = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove(HIGHLIGHT_CLASS);
  // Force a reflow so re-adding the class restarts the animation if the
  // same message is jumped to twice in a row.
  void el.offsetWidth;
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
}
