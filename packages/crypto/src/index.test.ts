import { describe, expect, it } from "vitest";
import {
  base64urlToBytes,
  bytesToBase64url,
  decryptBlob,
  decryptBytes,
  decryptJSON,
  deriveConversationKey,
  deriveIdentity,
  encryptBlob,
  encryptBytes,
  encryptJSON,
  formatRecoverySecret,
  generateChallenge,
  generateRecoverySecret,
  parseRecoverySecret,
  signChallenge,
  unwrapSecretWithPassword,
  verifyChallenge,
  wrapSecretWithPassword,
} from "./index.js";

describe("recovery secrets", () => {
  it("round-trips through formatting", () => {
    const secret = generateRecoverySecret();
    const formatted = formatRecoverySecret(secret);
    expect(formatted).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{1,5})*$/);
    const parsed = parseRecoverySecret(formatted);
    expect(parsed).toEqual(secret);
  });

  it("tolerates lowercase and stray whitespace on parse", () => {
    const secret = generateRecoverySecret();
    const formatted = formatRecoverySecret(secret);
    const messy = `  ${formatted.toLowerCase()}  `;
    expect(parseRecoverySecret(messy)).toEqual(secret);
  });

  it("generates unique secrets", () => {
    const a = generateRecoverySecret();
    const b = generateRecoverySecret();
    expect(a).not.toEqual(b);
  });
});

describe("identity derivation", () => {
  it("is deterministic for the same secret", () => {
    const secret = generateRecoverySecret();
    const a = deriveIdentity(secret);
    const b = deriveIdentity(secret);
    expect(a.publicId).toBe(b.publicId);
    expect(a.signingPublicKey).toEqual(b.signingPublicKey);
    expect(a.exchangePublicKey).toEqual(b.exchangePublicKey);
  });

  it("differs for different secrets", () => {
    const a = deriveIdentity(generateRecoverySecret());
    const b = deriveIdentity(generateRecoverySecret());
    expect(a.publicId).not.toBe(b.publicId);
  });

  it("produces a display-safe short public id", () => {
    const identity = deriveIdentity(generateRecoverySecret());
    expect(identity.publicId).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
});

describe("challenge signing", () => {
  it("verifies a signature from the matching identity", () => {
    const identity = deriveIdentity(generateRecoverySecret());
    const challenge = generateChallenge();
    const signature = signChallenge(identity.signingSecretKey, challenge);
    expect(verifyChallenge(identity.signingPublicKey, challenge, signature)).toBe(true);
  });

  it("rejects a signature from a different identity", () => {
    const identityA = deriveIdentity(generateRecoverySecret());
    const identityB = deriveIdentity(generateRecoverySecret());
    const challenge = generateChallenge();
    const signature = signChallenge(identityA.signingSecretKey, challenge);
    expect(verifyChallenge(identityB.signingPublicKey, challenge, signature)).toBe(false);
  });

  it("rejects a tampered challenge", () => {
    const identity = deriveIdentity(generateRecoverySecret());
    const challenge = generateChallenge();
    const signature = signChallenge(identity.signingSecretKey, challenge);
    const tampered = new Uint8Array(challenge);
    tampered.set([tampered[0]! ^ 0xff], 0);
    expect(verifyChallenge(identity.signingPublicKey, tampered, signature)).toBe(false);
  });

  it("never throws on garbage input", () => {
    const identity = deriveIdentity(generateRecoverySecret());
    expect(() => verifyChallenge(identity.signingPublicKey, new Uint8Array(1), new Uint8Array(1))).not.toThrow();
  });
});

describe("conversation key agreement", () => {
  it("both sides derive the same key independently", () => {
    const user = deriveIdentity(generateRecoverySecret());
    const admin = deriveIdentity(generateRecoverySecret());
    const conversationId = "conv-123";
    const keyFromUser = deriveConversationKey(user.exchangeSecretKey, admin.exchangePublicKey, conversationId);
    const keyFromAdmin = deriveConversationKey(admin.exchangeSecretKey, user.exchangePublicKey, conversationId);
    expect(keyFromUser).toEqual(keyFromAdmin);
  });

  it("produces different keys for different conversation ids (domain separation)", () => {
    const user = deriveIdentity(generateRecoverySecret());
    const admin = deriveIdentity(generateRecoverySecret());
    const keyA = deriveConversationKey(user.exchangeSecretKey, admin.exchangePublicKey, "conv-a");
    const keyB = deriveConversationKey(user.exchangeSecretKey, admin.exchangePublicKey, "conv-b");
    expect(keyA).not.toEqual(keyB);
  });
});

describe("authenticated encryption", () => {
  it("round-trips plaintext bytes", () => {
    const key = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const plaintext = new TextEncoder().encode("hello anonymous world");
    const payload = encryptBytes(key, plaintext);
    expect(decryptBytes(key, payload)).toEqual(plaintext);
  });

  it("round-trips JSON", () => {
    const key = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const value = { text: "Hello!", replyTo: null, mentions: ["ADMIN"] };
    const payload = encryptJSON(key, value);
    expect(decryptJSON(key, payload)).toEqual(value);
  });

  it("fails to decrypt with the wrong key", () => {
    const keyA = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const keyB = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const payload = encryptBytes(keyA, new TextEncoder().encode("secret"));
    expect(() => decryptBytes(keyB, payload)).toThrow();
  });

  it("fails to decrypt tampered ciphertext", () => {
    const key = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const payload = encryptBytes(key, new TextEncoder().encode("secret"));
    const tamperedBytes = base64urlToBytes(payload.ciphertext);
    tamperedBytes.set([tamperedBytes[0]! ^ 0xff], 0);
    const tampered = { ...payload, ciphertext: bytesToBase64url(tamperedBytes) };
    expect(() => decryptBytes(key, tampered)).toThrow();
  });
});

describe("blob encryption", () => {
  it("round-trips binary data", () => {
    const key = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const plaintext = new Uint8Array(4096).map((_, i) => i % 256);
    const blob = encryptBlob(key, plaintext);
    expect(decryptBlob(key, blob)).toEqual(plaintext);
  });

  it("produces a different nonce prefix every call", () => {
    const key = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const plaintext = new TextEncoder().encode("same content");
    const blobA = encryptBlob(key, plaintext);
    const blobB = encryptBlob(key, plaintext);
    expect(blobA.slice(0, 24)).not.toEqual(blobB.slice(0, 24));
  });

  it("fails to decrypt with the wrong key", () => {
    const keyA = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const keyB = deriveIdentity(generateRecoverySecret()).exchangeSecretKey;
    const blob = encryptBlob(keyA, new TextEncoder().encode("secret file"));
    expect(() => decryptBlob(keyB, blob)).toThrow();
  });
});

describe("password wrapping", () => {
  it("round-trips a secret with the correct password", async () => {
    const secret = generateRecoverySecret();
    const wrapped = await wrapSecretWithPassword(secret, "correct horse battery staple");
    const unwrapped = await unwrapSecretWithPassword(wrapped, "correct horse battery staple");
    expect(unwrapped).toEqual(secret);
  });

  it("fails with the wrong password", async () => {
    const secret = generateRecoverySecret();
    const wrapped = await wrapSecretWithPassword(secret, "correct horse battery staple");
    await expect(unwrapSecretWithPassword(wrapped, "wrong password")).rejects.toThrow();
  });
});
