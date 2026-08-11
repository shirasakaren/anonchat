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

export async function requireAnon(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.anonUser) throw Errors.unauthorized("Please create or restore an anonymous identity first.");
  if (request.anonUser.status === "BLOCKED") {
    throw Errors.blocked();
  }
  if (request.anonUser.status === "DELETED") {
    throw Errors.unauthorized();
  }
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.adminAuth) throw Errors.unauthorized("Admin sign-in required.");
}
