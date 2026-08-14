const STORAGE_KEY = "anonchat:notificationEmailPromptDismissed";

/** conversationId -> already shown/dismissed, so the "email me on reply"
 *  prompt (see NotificationEmailPrompt.tsx) only ever appears once per
 *  conversation on this browser, whether the visitor submitted an email or
 *  clicked "No thanks". Deliberately local-only, same tradeoff as
 *  locallyDeletedMessages.ts/mutedConversations.ts - this is a UI
 *  preference, not something the server needs to track. */
function readAll(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function isNotificationEmailPromptDismissed(conversationId: string): boolean {
  return readAll().includes(conversationId);
}

export function dismissNotificationEmailPrompt(conversationId: string): void {
  const existing = new Set(readAll());
  if (existing.has(conversationId)) return;
  existing.add(conversationId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing]));
  } catch {
    /* localStorage may be unavailable (private browsing quota, etc.) */
  }
}
