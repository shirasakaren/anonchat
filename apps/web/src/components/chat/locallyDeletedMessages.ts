const STORAGE_KEY = "anonchat:locallyDeletedMessages";

/** conversationId -> array of message ids "deleted for me" in this browser.
 *  There's no server-side concept of a per-participant hide (the schema
 *  only has one shared `deletedAt` per message, which is a real delete for
 *  everyone) - this is deliberately local-only, the same tradeoff
 *  mutedConversations.ts makes for admin mute state. It does not sync
 *  across devices/browsers for the same identity. */
type Registry = Record<string, string[]>;

function readAll(): Registry {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Registry) : {};
  } catch {
    return {};
  }
}

function writeAll(registry: Registry): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch {
    /* localStorage may be unavailable (private browsing quota, etc.) */
  }
}

export function getLocallyDeletedMessageIds(conversationId: string): Set<string> {
  return new Set(readAll()[conversationId] ?? []);
}

export function hideMessageLocally(conversationId: string, messageId: string): void {
  const registry = readAll();
  const existing = new Set(registry[conversationId] ?? []);
  if (existing.has(messageId)) return;
  existing.add(messageId);
  registry[conversationId] = [...existing];
  writeAll(registry);
}
