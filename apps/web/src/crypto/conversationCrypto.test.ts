import { deriveIdentity, generateRecoverySecret } from "@anonchat/crypto";
import { describe, expect, it } from "vitest";
import {
  decryptAttachmentMeta,
  decryptMessageText,
  decryptReaction,
  encryptAttachmentMeta,
  encryptMessageText,
  encryptReaction,
  getConversationKey,
} from "./conversationCrypto.js";

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeConversationKeyPair(conversationId: string) {
  const alice = deriveIdentity(generateRecoverySecret());
  const bob = deriveIdentity(generateRecoverySecret());
  const aliceKey = getConversationKey(alice, toBase64Url(bob.exchangePublicKey), conversationId);
  const bobKey = getConversationKey(bob, toBase64Url(alice.exchangePublicKey), conversationId);
  return { aliceKey, bobKey };
}

describe("conversationCrypto", () => {
  it("both participants derive the same conversation key", () => {
    const { aliceKey, bobKey } = makeConversationKeyPair("conv-1");
    expect(aliceKey).toEqual(bobKey);
  });

  it("round-trips message text", () => {
    const { aliceKey, bobKey } = makeConversationKeyPair("conv-2");
    const payload = encryptMessageText(aliceKey, "Hello, this is a test message!");
    expect(decryptMessageText(bobKey, payload)).toBe("Hello, this is a test message!");
  });

  it("returns a friendly placeholder instead of throwing on undecryptable content", () => {
    const { aliceKey } = makeConversationKeyPair("conv-3");
    const wrongKey = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const payload = encryptMessageText(aliceKey, "secret");
    expect(decryptMessageText(wrongKey, payload)).toBe("⚠️ Unable to decrypt this message.");
  });

  it("round-trips attachment metadata", () => {
    const { aliceKey, bobKey } = makeConversationKeyPair("conv-4");
    const meta = { filename: "photo.png", mimetype: "image/png", size: 12345 };
    const payload = encryptAttachmentMeta(aliceKey, meta);
    expect(decryptAttachmentMeta(bobKey, payload)).toEqual(meta);
  });

  it("returns null instead of throwing on undecryptable attachment metadata", () => {
    const { aliceKey } = makeConversationKeyPair("conv-5");
    const wrongKey = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const payload = encryptAttachmentMeta(aliceKey, { filename: "a", mimetype: "b", size: 1 });
    expect(decryptAttachmentMeta(wrongKey, payload)).toBeNull();
  });

  it("round-trips a reaction emoji", () => {
    const { aliceKey, bobKey } = makeConversationKeyPair("conv-6");
    const payload = encryptReaction(aliceKey, "👍");
    expect(decryptReaction(bobKey, payload)).toBe("👍");
  });

  it("produces different keys for different conversation ids", () => {
    const alice = deriveIdentity(generateRecoverySecret());
    const bob = deriveIdentity(generateRecoverySecret());
    const bobB64 = toBase64Url(bob.exchangePublicKey);
    const keyA = getConversationKey(alice, bobB64, "conv-a");
    const keyB = getConversationKey(alice, bobB64, "conv-b");
    expect(keyA).not.toEqual(keyB);
  });
});
