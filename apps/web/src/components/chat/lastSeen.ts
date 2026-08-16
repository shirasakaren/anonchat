/** Per-device "last message I have actually seen" cursor, used to reopen a
 *  conversation at the right spot: the next open lands on the first message
 *  after this cursor (with an unread divider above it) instead of loading
 *  from the very top and auto-scrolling through the whole history. This is
 *  deliberately local-only - the server's readAt receipts answer "did the
 *  other party read my message", while this answers "how far have I
 *  personally scrolled in this conversation on this device". */
const STORAGE_PREFIX = "anonchat:lastSeen";

export interface LastSeenCursor {
  messageId: string;
  createdAt: string;
}

export type ViewerRole = "ADMIN" | "USER";

function storageKey(role: ViewerRole, conversationId: string): string {
  return `${STORAGE_PREFIX}:${role}:${conversationId}`;
}

export function getLastSeen(role: ViewerRole, conversationId: string): LastSeenCursor | null {
  try {
    const raw = localStorage.getItem(storageKey(role, conversationId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as LastSeenCursor).messageId === "string" &&
      typeof (parsed as LastSeenCursor).createdAt === "string"
    ) {
      return parsed as LastSeenCursor;
    }
    return null;
  } catch {
    return null;
  }
}

export function setLastSeen(role: ViewerRole, conversationId: string, messageId: string, createdAt: string): void {
  try {
    localStorage.setItem(storageKey(role, conversationId), JSON.stringify({ messageId, createdAt }));
  } catch {
    /* localStorage may be unavailable (private browsing quota, etc.) */
  }
}

/** The first message the viewer has not seen yet, or null when everything
 *  up to the cursor has been seen (open at the bottom in that case). */
export function computeUnreadAnchor(
  messages: ReadonlyArray<{ id: string; createdAt: string }>,
  lastSeen: LastSeenCursor | null,
): { id: string } | null {
  if (!lastSeen) return null;
  return messages.find((m) => m.createdAt > lastSeen.createdAt) ?? null;
}
