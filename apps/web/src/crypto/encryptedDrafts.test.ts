import { describe, expect, it } from "vitest";
import { deriveIdentity, generateRecoverySecret } from "@anonchat/crypto";
import {
  clearEncryptedDraftIfMatches,
  deleteEncryptedDraft,
  loadEncryptedDraft,
  saveEncryptedDraft,
} from "./encryptedDrafts.js";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const key = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;

describe("encrypted drafts", () => {
  it("round-trips without storing message plaintext", () => {
    const storage = new MemoryStorage();
    saveEncryptedDraft("USER", "conversation-1", key, "unfinished secret", storage);
    expect([...storage.values.values()].join("")).not.toContain("unfinished secret");
    expect(loadEncryptedDraft("USER", "conversation-1", key, storage)).toBe("unfinished secret");
  });

  it("separates roles and conversations", () => {
    const storage = new MemoryStorage();
    saveEncryptedDraft("ADMIN", "one", key, "admin one", storage);
    expect(loadEncryptedDraft("USER", "one", key, storage)).toBe("");
    expect(loadEncryptedDraft("ADMIN", "two", key, storage)).toBe("");
  });

  it("only clears the draft that was actually sent", () => {
    const storage = new MemoryStorage();
    saveEncryptedDraft("USER", "one", key, "newer text", storage);
    clearEncryptedDraftIfMatches("USER", "one", key, "older text", storage);
    expect(loadEncryptedDraft("USER", "one", key, storage)).toBe("newer text");
    clearEncryptedDraftIfMatches("USER", "one", key, "newer text", storage);
    expect(loadEncryptedDraft("USER", "one", key, storage)).toBe("");
  });

  it("discards ciphertext that cannot be decrypted with this identity", () => {
    const storage = new MemoryStorage();
    saveEncryptedDraft("USER", "one", key, "private", storage);
    const otherKey = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    expect(loadEncryptedDraft("USER", "one", otherKey, storage)).toBe("");
    expect(storage.values.size).toBe(0);
  });

  it("removes a conversation draft during identity erasure", () => {
    const storage = new MemoryStorage();
    saveEncryptedDraft("USER", "one", key, "private", storage);
    deleteEncryptedDraft("USER", "one", storage);
    expect(loadEncryptedDraft("USER", "one", key, storage)).toBe("");
  });
});
