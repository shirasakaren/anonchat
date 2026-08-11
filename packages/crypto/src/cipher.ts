import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { XCHACHA_NONCE_BYTES } from "./constants.js";
import { base64urlToBytes, bytesToBase64url } from "./encoding.js";

export interface EncryptedPayload {
  nonce: string;
  ciphertext: string;
}

/** XChaCha20-Poly1305: safe to use with fresh random nonces (no counter needed). */
export function encryptBytes(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): EncryptedPayload {
  const nonce = randomBytes(XCHACHA_NONCE_BYTES);
  const cipher = xchacha20poly1305(key, nonce, aad);
  const ciphertext = cipher.encrypt(plaintext);
  return { nonce: bytesToBase64url(nonce), ciphertext: bytesToBase64url(ciphertext) };
}

/** Throws if the ciphertext was tampered with or the key/AAD don't match. */
export function decryptBytes(key: Uint8Array, payload: EncryptedPayload, aad?: Uint8Array): Uint8Array {
  const nonce = base64urlToBytes(payload.nonce);
  const ciphertext = base64urlToBytes(payload.ciphertext);
  const cipher = xchacha20poly1305(key, nonce, aad);
  return cipher.decrypt(ciphertext);
}

export function encryptJSON<T>(key: Uint8Array, value: T, aad?: Uint8Array): EncryptedPayload {
  return encryptBytes(key, utf8ToBytes(JSON.stringify(value)), aad);
}

export function decryptJSON<T>(key: Uint8Array, payload: EncryptedPayload, aad?: Uint8Array): T {
  const bytes = decryptBytes(key, payload, aad);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * Nonce-prefixed single blob, for binary payloads (attachment bytes) that
 * travel as one opaque upload/download rather than as JSON - the nonce
 * must never be reused, so each call mints a fresh one and ships it
 * alongside the ciphertext instead of relying on a caller-managed nonce.
 */
export function encryptBlob(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = randomBytes(XCHACHA_NONCE_BYTES);
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export function decryptBlob(key: Uint8Array, blob: Uint8Array): Uint8Array {
  const nonce = blob.slice(0, XCHACHA_NONCE_BYTES);
  const ciphertext = blob.slice(XCHACHA_NONCE_BYTES);
  const cipher = xchacha20poly1305(key, nonce);
  return cipher.decrypt(ciphertext);
}
