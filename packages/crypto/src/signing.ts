import { ed25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { CHALLENGE_BYTES } from "./constants.js";

export function generateChallenge(): Uint8Array {
  return randomBytes(CHALLENGE_BYTES);
}

export function signChallenge(signingSecretKey: Uint8Array, challenge: Uint8Array): Uint8Array {
  return ed25519.sign(challenge, signingSecretKey);
}

/** Never throws: malformed signatures/keys are treated as a failed verification. */
export function verifyChallenge(signingPublicKey: Uint8Array, challenge: Uint8Array, signature: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, challenge, signingPublicKey);
  } catch {
    return false;
  }
}
