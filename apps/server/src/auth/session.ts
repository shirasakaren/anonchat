import { randomBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { bytesToBase64url } from "@termine/crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ANON_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from "@termine/shared";
import { prisma } from "../db.js";
import { loadEnv } from "../env.js";

const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  return bytesToBase64url(randomBytes(32));
}

export function hashSessionToken(token: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(token)));
}

export function isSecureContext(): boolean {
  const env = loadEnv();
  try {
    return new URL(env.PUBLIC_URL).protocol === "https:";
  } catch {
    return env.NODE_ENV === "production";
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax" as const,
    path: "/",
  };
}

export function setAnonSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(ANON_SESSION_COOKIE, token, { ...cookieOptions(), maxAge: 60 * 60 * 24 * 365 * 10 });
}

export function clearAnonSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(ANON_SESSION_COOKIE, { path: "/" });
}

export function setAdminSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(ADMIN_SESSION_COOKIE, token, { ...cookieOptions(), maxAge: ADMIN_SESSION_TTL_MS / 1000 });
}

export function clearAdminSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
}

export async function createAnonymousSession(anonymousUserId: string, ipAddress: string | null) {
  const token = generateSessionToken();
  await prisma.anonymousSession.create({
    data: { anonymousUserId, tokenHash: hashSessionToken(token), ipAddress },
  });
  return token;
}

export async function resolveAnonymousUserFromRequest(request: FastifyRequest) {
  const token = request.cookies[ANON_SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.anonymousSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { anonymousUser: { include: { conversation: true } } },
  });
  if (!session || session.revokedAt) return null;
  await prisma.$transaction([
    prisma.anonymousSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }),
    prisma.anonymousUser.update({ where: { id: session.anonymousUser.id }, data: { lastSeenAt: new Date() } }),
  ]);
  return session.anonymousUser;
}

export async function createAdminSession(adminId: string, ipAddress: string | null, userAgent: string | null) {
  const token = generateSessionToken();
  const session = await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash: hashSessionToken(token),
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS),
    },
  });
  return { token, sessionId: session.id };
}

export async function resolveAdminFromRequest(request: FastifyRequest) {
  const token = request.cookies[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { admin: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const now = new Date();
  await prisma.adminSession.update({
    where: { id: session.id },
    data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + ADMIN_SESSION_TTL_MS) },
  });
  return { admin: session.admin, sessionId: session.id };
}

export async function revokeAdminSession(sessionId: string, adminId: string): Promise<boolean> {
  const result = await prisma.adminSession.updateMany({
    where: { id: sessionId, adminId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export async function revokeAdminSessionByToken(token: string): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
