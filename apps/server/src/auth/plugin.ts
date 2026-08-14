import type { Admin, AnonymousUser, Conversation } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { Errors } from "../utils/errors.js";
import { resolveAdminFromRequest, resolveAnonymousUserFromRequest } from "./session.js";

type AnonUserWithConversation = AnonymousUser & { conversation: Conversation | null };

declare module "fastify" {
  interface FastifyRequest {
    anonUser: AnonUserWithConversation | null;
    adminAuth: { admin: Admin; sessionId: string } | null;
  }
}

/**
 * Resolves the caller's identity from cookies onto the request. Scoped to
 * the `/api` prefix in app.ts so unauthenticated infra endpoints (health
 * checks) never pay for a session lookup.
 */
// Keep Fastify's promise-based plugin lifecycle even though registration
// itself is synchronous; the hooks registered below perform async work.
// eslint-disable-next-line @typescript-eslint/require-await
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("anonUser", null);
  fastify.decorateRequest("adminAuth", null);

  fastify.addHook("onRequest", async (request) => {
    request.anonUser = await resolveAnonymousUserFromRequest(request);
    const adminResult = await resolveAdminFromRequest(request);
    request.adminAuth = adminResult ? { admin: adminResult.admin, sessionId: adminResult.sessionId } : null;
  });
};

export default fp(authPlugin, { name: "auth-plugin" });

// Fastify treats a two-argument async hook as promise-based. A synchronous
// two-argument form is interpreted as callback-style and waits forever for a
// missing `done`, so these guards must remain async even without an await.
// eslint-disable-next-line @typescript-eslint/require-await
export async function requireAnon(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.anonUser) throw Errors.unauthorized("Please create or restore an anonymous identity first.");
  if (request.anonUser.status === "BLOCKED") {
    throw Errors.blocked();
  }
  if (request.anonUser.status === "DELETED") {
    throw Errors.unauthorized();
  }
}

/**
 * Authenticates ownership without requiring an active chat. Privacy/account
 * controls such as permanent erasure must remain available to a blocked
 * person even though messaging mutations do not.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function requireAnonIdentity(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.anonUser || request.anonUser.status === "DELETED") {
    throw Errors.unauthorized("Please create or restore an anonymous identity first.");
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.adminAuth) throw Errors.unauthorized("Admin sign-in required.");
}

/** For endpoints both sides of a conversation need (e.g. link previews) -
 *  passes for either a valid anonymous session or an admin session, no
 *  conversation-scoping implied either way. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function requireAnyAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.adminAuth) return;
  if (request.anonUser && request.anonUser.status !== "BLOCKED" && request.anonUser.status !== "DELETED") return;
  throw Errors.unauthorized();
}
