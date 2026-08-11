import { randomBytes } from "@noble/hashes/utils.js";
import { RECOVERY_SECRET_BYTES } from "./constants.js";
import { base32Decode, base32Encode } from "./encoding.js";

/**
 * A 256-bit secret, per spec section 26: cryptographically secure random,
 * never predictable, and the sole seed for a user's identity keypair.
 * Losing it (with no other saved session) makes the account unrecoverable
 * by design - the server never stores it or anything that lets it be derived.
 */
export function generateRecoverySecret(): Uint8Array {
  return randomBytes(RECOVERY_SECRET_BYTES);
}

/** Groups of 5 base32 characters, e.g. "ABCDE-FGHIJ-...", for display/copy. */
export function formatRecoverySecret(secret: Uint8Array): string {
  const encoded = base32Encode(secret);
  const groups: string[] = [];
  for (let i = 0; i < encoded.length; i += 5) {
    groups.push(encoded.slice(i, i + 5));
  }
  return groups.join("-");
}

export function parseRecoverySecret(formatted: string): Uint8Array {
  const bytes = base32Decode(formatted);
  if (bytes.length !== RECOVERY_SECRET_BYTES) {
    throw new Error("Invalid recovery key");
  }
  return bytes;
}
