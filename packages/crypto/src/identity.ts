import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { IDENTITY_HKDF_SALT, PUBLIC_ID_BYTES } from "./constants.js";

export interface Identity {
  publicId: string;
  signingSecretKey: Uint8Array;
  signingPublicKey: Uint8Array;
  exchangeSecretKey: Uint8Array;
  exchangePublicKey: Uint8Array;
}

export interface IdentityPublicKeys {
  publicId: string;
  signingPublicKey: Uint8Array;
  exchangePublicKey: Uint8Array;
}

const SALT = utf8ToBytes(IDENTITY_HKDF_SALT);

/**
 * Deterministically derives a full identity keypair set from a secret.
 * Same secret in -> same keypairs and public_id out, on any device. This is
 * the entire recovery mechanism: no server-side secret storage is involved.
 *
 * Two independent HKDF branches (rather than one converted key) avoid any
 * dependency on Ed25519<->X25519 conversion being exposed by the curve
 * library, and keep signing/encryption key material domain-separated.
 */
export function deriveIdentity(secret: Uint8Array): Identity {
  const signSeed = hkdf(sha256, secret, SALT, utf8ToBytes("ed25519-signing"), 32);
  const dhSeed = hkdf(sha256, secret, SALT, utf8ToBytes("x25519-exchange"), 32);
  const signing = ed25519.keygen(signSeed);
  const exchange = x25519.keygen(dhSeed);
  const publicId = derivePublicId(signing.publicKey, exchange.publicKey);
  return {
    publicId,
    signingSecretKey: signing.secretKey,
    signingPublicKey: signing.publicKey,
    exchangeSecretKey: exchange.secretKey,
    exchangePublicKey: exchange.publicKey,
  };
}

/**
 * A short, safe-to-display label derived from both public keys. It is a
 * one-way hash truncated to a few bytes - it cannot be reversed to recover
 * either public key, let alone the underlying secret.
 */
export function derivePublicId(signingPublicKey: Uint8Array, exchangePublicKey: Uint8Array): string {
  const digest = sha256(concatBytes(signingPublicKey, exchangePublicKey));
  const bytes = digest.slice(0, PUBLIC_ID_BYTES);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
