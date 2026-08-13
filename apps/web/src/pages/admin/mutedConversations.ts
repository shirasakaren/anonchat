/** Tiny module-level registry of muted conversation ids, so
 *  GlobalNotifications (mounted at the app level, on any admin page) can
 *  suppress the sound/popup for conversations the admin muted without
 *  re-fetching the list. ConversationList keeps it in sync from fetched
 *  summaries and updates it immediately on mute/unmute actions. */
let mutedIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

export function isConversationMuted(conversationId: string): boolean {
  return mutedIds.has(conversationId);
}

export function setConversationMutedLocally(conversationId: string, muted: boolean): void {
  if (muted) mutedIds.add(conversationId);
  else mutedIds.delete(conversationId);
  emit();
}

export function syncMutedConversationIds(ids: Iterable<string>): void {
  mutedIds = new Set(ids);
  emit();
}

export function subscribeMutedConversations(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
