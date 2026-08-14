import {
  bytesToBase64url,
  deriveIdentity,
  formatRecoverySecret,
  generateRecoverySecret,
  parseRecoverySecret,
  unwrapSecretWithPassword,
  wrapSecretWithPassword,
  type Identity,
} from "@anonchat/crypto";
import type { PublicKeysInput } from "@anonchat/shared";
import { getDb } from "./db.js";

/**
 * The admin's E2EE identity private key never touches the server. On this
 * browser it is cached wrapped-with-password in IndexedDB so the admin
 * isn't asked to re-paste their encryption recovery phrase on every load;
 * unwrapped, it lives only in this module's memory for the tab's lifetime.
 */
let unlockedIdentity: Identity | null = null;

export class AdminKeyMismatchError extends Error {
  constructor() {
    super(
      "This encryption recovery key belongs to a different Anonchat setup. Use the recovery key created for this admin account.",
    );
    this.name = "AdminKeyMismatchError";
  }
}

export function adminIdentityMatches(identity: Identity, expected: PublicKeysInput): boolean {
  return (
    bytesToBase64url(identity.signingPublicKey) === expected.signingPublicKey &&
    bytesToBase64url(identity.exchangePublicKey) === expected.exchangePublicKey
  );
}

export function getUnlockedAdminIdentity(): Identity | null {
  return unlockedIdentity;
}

export function lockAdminIdentity(): void {
  unlockedIdentity = null;
}

export async function hasCachedAdminKey(): Promise<boolean> {
  const db = await getDb();
  return (await db.get("adminKey", "admin")) !== undefined;
}

/** First-time setup: generates the admin's encryption identity and caches it behind the login password. */
export async function createAndCacheAdminIdentity(
  password: string,
): Promise<{ identity: Identity; recoveryPhrase: string }> {
  const secret = generateRecoverySecret();
  const identity = deriveIdentity(secret);
  await cacheAdminSecret(secret, password);
  unlockedIdentity = identity;
  return { identity, recoveryPhrase: formatRecoverySecret(secret) };
}

async function cacheAdminSecret(secret: Uint8Array, password: string): Promise<void> {
  const wrapped = await wrapSecretWithPassword(secret, password);
  const db = await getDb();
  await db.put("adminKey", { id: "admin", salt: wrapped.salt, ...wrapped.payload });
}

/** Unlocks the cached key on this browser using the admin's login password. Throws if the password is wrong. */
export async function unlockAdminIdentity(password: string, expected: PublicKeysInput): Promise<Identity> {
  const db = await getDb();
  const record = await db.get("adminKey", "admin");
  if (!record) throw new Error("No encryption key is cached on this device yet.");
  const secret = await unwrapSecretWithPassword(
    { salt: record.salt, payload: { nonce: record.nonce, ciphertext: record.ciphertext } },
    password,
  );
  const identity = deriveIdentity(secret);
  if (!adminIdentityMatches(identity, expected)) {
    secret.fill(0);
    unlockedIdentity = null;
    throw new AdminKeyMismatchError();
  }
  secret.fill(0);
  unlockedIdentity = identity;
  return identity;
}

/** New-device flow: re-derive from the recovery phrase, then cache it behind this browser's login password. */
export async function importAdminIdentityFromRecoveryPhrase(
  phrase: string,
  password: string,
  expected: PublicKeysInput,
): Promise<Identity> {
  const secret = parseRecoverySecret(phrase);
  const identity = deriveIdentity(secret);
  if (!adminIdentityMatches(identity, expected)) {
    secret.fill(0);
    throw new AdminKeyMismatchError();
  }
  await cacheAdminSecret(secret, password);
  secret.fill(0);
  unlockedIdentity = identity;
  return identity;
}

/** "Forget this device": removes the cached wrapped key entirely (does not affect the account itself). */
export async function forgetAdminKeyOnThisDevice(): Promise<void> {
  const db = await getDb();
  await db.delete("adminKey", "admin");
  unlockedIdentity = null;
}
