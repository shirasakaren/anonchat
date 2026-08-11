import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { CONVERSATION_HKDF_INFO_PREFIX, SYMMETRIC_KEY_BYTES } from "./constants.js";

/**
 * Both participants derive the same symmetric conversation key independently
 * via ECDH - it is never transmitted, and the server (which only ever sees
 * public keys) cannot compute it. Binding the HKDF info to the conversation
 * id domain-separates keys if an identity is ever part of more than one
 * conversation in the future.
 */
export function deriveConversationKey(
  myExchangeSecretKey: Uint8Array,
  theirExchangePublicKey: Uint8Array,
  conversationId: string,
): Uint8Array {
  const shared = x25519.getSharedSecret(myExchangeSecretKey, theirExchangePublicKey);
  try {
    return hkdf(
      sha256,
      shared,
      undefined,
      utf8ToBytes(`${CONVERSATION_HKDF_INFO_PREFIX}${conversationId}`),
      SYMMETRIC_KEY_BYTES,
    );
  } finally {
    shared.fill(0);
  }
}
