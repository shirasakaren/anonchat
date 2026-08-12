import {
  deriveIdentity,
  formatRecoverySecret,
  generateRecoverySecret,
  parseRecoverySecret,
  type Identity,
} from "@anonchat/crypto";
import { getDb, type StoredIdentityRecord } from "./db.js";

const ACTIVE_IDENTITY_KEY = "anonchat.activeIdentity";

export interface IdentitySummary {
  publicId: string;
  label: string;
  createdAt: string;
  lastUsedAt: string;
}

function toSummary(record: StoredIdentityRecord): IdentitySummary {
  return { publicId: record.publicId, label: record.label, createdAt: record.createdAt, lastUsedAt: record.lastUsedAt };
}

export async function listIdentities(): Promise<IdentitySummary[]> {
  const db = await getDb();
  const all = await db.getAll("identities");
  return all.map(toSummary).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export function getActiveIdentityId(): string | null {
  return localStorage.getItem(ACTIVE_IDENTITY_KEY);
}

export function setActiveIdentityId(publicId: string): void {
  localStorage.setItem(ACTIVE_IDENTITY_KEY, publicId);
}

export function clearActiveIdentityId(): void {
  localStorage.removeItem(ACTIVE_IDENTITY_KEY);
}

async function persist(publicId: string, secret: Uint8Array, label: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.put("identities", { publicId, secret, label, createdAt: now, lastUsedAt: now });
}

export async function touchIdentity(publicId: string): Promise<void> {
  const db = await getDb();
  const record = await db.get("identities", publicId);
  if (!record) return;
  record.lastUsedAt = new Date().toISOString();
  await db.put("identities", record);
}

/** Creates a brand new identity and returns the one-time-shown recovery phrase. */
export async function createIdentity(label = "Anonymous"): Promise<{ identity: Identity; recoveryPhrase: string }> {
  const secret = generateRecoverySecret();
  const identity = deriveIdentity(secret);
  await persist(identity.publicId, secret, label);
  setActiveIdentityId(identity.publicId);
  return { identity, recoveryPhrase: formatRecoverySecret(secret) };
}

export async function loadIdentity(publicId: string): Promise<Identity | null> {
  const db = await getDb();
  const record = await db.get("identities", publicId);
  if (!record) return null;
  return deriveIdentity(record.secret);
}

/** Re-derives and stores an identity from a pasted recovery phrase (new device, or lost local storage). */
export async function importIdentityFromRecoveryPhrase(
  phrase: string,
  label = "Recovered identity",
): Promise<Identity> {
  const secret = parseRecoverySecret(phrase);
  const identity = deriveIdentity(secret);
  const db = await getDb();
  const existing = await db.get("identities", identity.publicId);
  await persist(identity.publicId, secret, existing?.label ?? label);
  setActiveIdentityId(identity.publicId);
  return identity;
}

export async function removeIdentity(publicId: string): Promise<void> {
  const db = await getDb();
  await db.delete("identities", publicId);
  if (getActiveIdentityId() === publicId) clearActiveIdentityId();
}

export async function renameIdentity(publicId: string, label: string): Promise<void> {
  const db = await getDb();
  const record = await db.get("identities", publicId);
  if (!record) return;
  record.label = label;
  await db.put("identities", record);
}
