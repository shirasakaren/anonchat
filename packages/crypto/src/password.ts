import { scryptAsync } from "@noble/hashes/scrypt.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { decryptBytes, encryptBytes, type EncryptedPayload } from "./cipher.js";
import { base64urlToBytes, bytesToBase64url } from "./encoding.js";

const SCRYPT_OPTS = { N: 2 ** 17, r: 8, p: 1, dkLen: 32 };

export interface WrappedSecret {
  salt: string;
  payload: EncryptedPayload;
}

/**
 * Wraps arbitrary secret bytes (typically a recovery secret) behind a
 * password, for caching in browser-local storage. Used so an admin doesn't
 * have to re-paste their encryption recovery phrase on every page load on a
 * browser they've already unlocked once - only the wrapped blob is
 * persisted locally, never sent to the server.
 */
export async function wrapSecretWithPassword(secret: Uint8Array, password: string): Promise<WrappedSecret> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_OPTS);
  const payload = encryptBytes(key, secret);
  return { salt: bytesToBase64url(salt), payload };
}

/** Throws if the password is wrong (AEAD authentication fails). */
export async function unwrapSecretWithPassword(wrapped: WrappedSecret, password: string): Promise<Uint8Array> {
  const salt = base64urlToBytes(wrapped.salt);
  const key = await scryptAsync(password, salt, SCRYPT_OPTS);
  return decryptBytes(key, wrapped.payload);
}
