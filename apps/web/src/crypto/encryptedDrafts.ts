import { decryptJSON, encryptJSON } from "@anonchat/crypto";

export type DraftRole = "ADMIN" | "USER";

interface StoredDraft {
  version: 1;
  text: string;
}

interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "anonchat:encrypted-draft:v1";

function draftStorageKey(role: DraftRole, conversationId: string): string {
  return `${PREFIX}:${role.toLowerCase()}:${conversationId}`;
}

function storageOrNull(storage?: DraftStorage): DraftStorage | null {
  if (storage) return storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function aadFor(storageKey: string): Uint8Array {
  return new TextEncoder().encode(storageKey);
}

export function loadEncryptedDraft(
  role: DraftRole,
  conversationId: string,
  conversationKey: Uint8Array,
  storage?: DraftStorage,
): string {
  const target = storageOrNull(storage);
  if (!target) return "";
  const storageKey = draftStorageKey(role, conversationId);
  const serialized = target.getItem(storageKey);
  if (!serialized) return "";
  try {
    const parsed = JSON.parse(serialized) as { nonce?: unknown; ciphertext?: unknown };
    if (typeof parsed.nonce !== "string" || typeof parsed.ciphertext !== "string") throw new Error("invalid draft");
    const draft = decryptJSON<StoredDraft>(
      conversationKey,
      { nonce: parsed.nonce, ciphertext: parsed.ciphertext },
      aadFor(storageKey),
    );
    if (draft.version !== 1 || typeof draft.text !== "string") throw new Error("invalid draft");
    return draft.text;
  } catch {
    // A changed identity key or corrupted browser storage must never trap
    // the composer in a failure loop. The unreadable local-only value has
    // no recoverable purpose, so remove only this exact conversation key.
    target.removeItem(storageKey);
    return "";
  }
}

export function saveEncryptedDraft(
  role: DraftRole,
  conversationId: string,
  conversationKey: Uint8Array,
  text: string,
  storage?: DraftStorage,
): void {
  const target = storageOrNull(storage);
  if (!target) return;
  const storageKey = draftStorageKey(role, conversationId);
  try {
    if (!text) {
      target.removeItem(storageKey);
      return;
    }
    const payload = encryptJSON<StoredDraft>(conversationKey, { version: 1, text }, aadFor(storageKey));
    target.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Private browsing modes and storage quotas can reject localStorage.
    // Draft persistence is a convenience and must never block composing.
  }
}

export function clearEncryptedDraftIfMatches(
  role: DraftRole,
  conversationId: string,
  conversationKey: Uint8Array,
  sentText: string,
  storage?: DraftStorage,
): void {
  const target = storageOrNull(storage);
  if (!target) return;
  if (loadEncryptedDraft(role, conversationId, conversationKey, target) === sentText) {
    target.removeItem(draftStorageKey(role, conversationId));
  }
}
