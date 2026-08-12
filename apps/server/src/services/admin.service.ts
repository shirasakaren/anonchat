import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import { base64urlToBytes, bytesToBase64url, decryptBytes, encryptBytes, verifyChallenge } from "@anonchat/crypto";
import { buildRegistrationProofMessage, type AdminSessionDto, type PublicKeysInput } from "@anonchat/shared";
import type { Admin } from "@prisma/client";
import { prisma } from "../db.js";
import { loadEnv } from "../env.js";
import { AppError, Errors } from "../utils/errors.js";

// Argon2id is the library default; memory/time/parallelism raised above its
// defaults (OWASP-recommended interactive-login range).
const ARGON2_OPTIONS = { memoryCost: 65_536, timeCost: 3, parallelism: 4 };

export async function adminExists(): Promise<boolean> {
  const count = await prisma.admin.count();
  return count > 0;
}

export async function getAdminPublicKeys(): Promise<PublicKeysInput | null> {
  const admin = await prisma.admin.findFirst({ select: { signingPublicKey: true, exchangePublicKey: true } });
  if (!admin) return null;
  return {
    signingPublicKey: bytesToBase64url(admin.signingPublicKey),
    exchangePublicKey: bytesToBase64url(admin.exchangePublicKey),
  };
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON2_OPTIONS);
}

let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("not-a-real-password-used-only-to-equalize-timing");
  return dummyHash;
}

export async function onboardAdmin(params: {
  username: string;
  password: string;
  displayName: string;
  signingPublicKey: Uint8Array;
  exchangePublicKey: Uint8Array;
  signingPublicKeyB64: string;
  exchangePublicKeyB64: string;
  proof: Uint8Array;
}): Promise<Admin> {
  if (await adminExists()) {
    throw Errors.conflict("Onboarding has already been completed on this instance.");
  }
  const message = buildRegistrationProofMessage(params.signingPublicKeyB64, params.exchangePublicKeyB64);
  if (!verifyChallenge(params.signingPublicKey, message, params.proof)) {
    throw Errors.badRequest("Could not verify that you control the submitted key.");
  }
  const passwordHash = await hashPassword(params.password);
  return prisma.admin.create({
    data: {
      username: params.username,
      passwordHash,
      displayName: params.displayName,
      signingPublicKey: Buffer.from(params.signingPublicKey),
      exchangePublicKey: Buffer.from(params.exchangePublicKey),
    },
  });
}

function totpEncryptionKey(): Uint8Array {
  const env = loadEnv();
  return hkdf(sha256, utf8ToBytes(env.SESSION_SECRET), undefined, utf8ToBytes("anonchat-totp-secret-v1"), 32);
}

function encryptTotpSecret(secret: string): { ciphertext: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer> } {
  const payload = encryptBytes(totpEncryptionKey(), utf8ToBytes(secret));
  return {
    ciphertext: new Uint8Array(base64urlToBytes(payload.ciphertext)),
    nonce: new Uint8Array(base64urlToBytes(payload.nonce)),
  };
}

function decryptTotpSecret(admin: Pick<Admin, "totpSecretCiphertext" | "totpSecretNonce">): string {
  if (!admin.totpSecretCiphertext || !admin.totpSecretNonce) {
    throw Errors.badRequest("Two-factor authentication is not set up.");
  }
  const bytes = decryptBytes(totpEncryptionKey(), {
    ciphertext: bytesToBase64url(admin.totpSecretCiphertext),
    nonce: bytesToBase64url(admin.totpSecretNonce),
  });
  return new TextDecoder().decode(bytes);
}

export async function verifyAdminLogin(username: string, password: string, totpCode?: string): Promise<Admin> {
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) {
    await getDummyHash().then((h) => argonVerify(h, password)).catch(() => false);
    throw Errors.unauthorized("Invalid username or password.");
  }
  const passwordOk = await argonVerify(admin.passwordHash, password);
  if (!passwordOk) {
    throw Errors.unauthorized("Invalid username or password.");
  }
  if (admin.totpEnabled) {
    if (!totpCode) {
      throw new AppError(401, "TOTP_REQUIRED", "Enter your two-factor authentication code.");
    }
    const secret = decryptTotpSecret(admin);
    const result = await verifyTotp({ secret, token: totpCode });
    if (!result.valid) {
      throw Errors.unauthorized("Invalid two-factor authentication code.");
    }
  }
  return admin;
}

export async function beginTotpSetup(adminId: string): Promise<{ secret: string; uri: string }> {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } });
  const secret = generateSecret();
  const encrypted = encryptTotpSecret(secret);
  await prisma.admin.update({
    where: { id: adminId },
    data: { totpSecretCiphertext: encrypted.ciphertext, totpSecretNonce: encrypted.nonce, totpEnabled: false },
  });
  const uri = generateURI({ issuer: "Anonchat", label: admin.username, secret });
  return { secret, uri };
}

export async function confirmTotpSetup(adminId: string, code: string): Promise<void> {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } });
  const secret = decryptTotpSecret(admin);
  const result = await verifyTotp({ secret, token: code });
  if (!result.valid) {
    throw Errors.badRequest("Invalid code. Please try again.");
  }
  await prisma.admin.update({ where: { id: adminId }, data: { totpEnabled: true } });
}

export async function disableTotp(adminId: string): Promise<void> {
  await prisma.admin.update({
    where: { id: adminId },
    data: { totpEnabled: false, totpSecretCiphertext: null, totpSecretNonce: null },
  });
}

export async function listAdminSessions(adminId: string, currentSessionId: string): Promise<AdminSessionDto[]> {
  const sessions = await prisma.adminSession.findMany({
    where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
  return sessions.map((session) => ({
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    current: session.id === currentSessionId,
  }));
}
