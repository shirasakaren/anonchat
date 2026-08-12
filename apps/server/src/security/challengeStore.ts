import { randomBytes } from "@noble/hashes/utils.js";
import { bytesToBase64url } from "@anonchat/crypto";
import { CHALLENGE_TTL_SECONDS } from "@anonchat/shared";

interface StoredChallenge {
  publicId: string;
  challenge: string;
  expiresAt: number;
}

const challenges = new Map<string, StoredChallenge>();

export function issueChallenge(publicId: string): { challengeId: string; challenge: string; expiresAt: number } {
  const challengeId = bytesToBase64url(randomBytes(16));
  const challenge = bytesToBase64url(randomBytes(32));
  const expiresAt = Date.now() + CHALLENGE_TTL_SECONDS * 1000;
  challenges.set(challengeId, { publicId, challenge, expiresAt });
  return { challengeId, challenge, expiresAt };
}

/** Single-use: consumes the challenge whether or not verification later succeeds. */
export function consumeChallenge(challengeId: string, publicId: string): string | null {
  const stored = challenges.get(challengeId);
  challenges.delete(challengeId);
  if (!stored) return null;
  if (stored.expiresAt < Date.now()) return null;
  if (stored.publicId !== publicId) return null;
  return stored.challenge;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of challenges) {
    if (entry.expiresAt < now) challenges.delete(id);
  }
}, 60_000);
cleanupTimer.unref();
