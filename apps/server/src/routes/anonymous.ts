import type { FastifyInstance } from "fastify";
import { base64urlToBytes } from "@termine/crypto";
import { ANON_SESSION_COOKIE, ChallengeRequestSchema, RecoverRequestSchema, RegisterRequestSchema } from "@termine/shared";
import type { ChallengeResponse, MeResponse, RegisterResponse } from "@termine/shared";
import { loadEnv } from "../env.js";
import { getAdminPublicKeys } from "../services/admin.service.js";
import {
  beginAnonymousLogin,
  completeAnonymousLogin,
  registerAnonymousUser,
} from "../services/anonymousUser.service.js";
import {
  clearAnonSessionCookie,
  createAnonymousSession,
  hashSessionToken,
  setAnonSessionCookie,
} from "../auth/session.js";
import { requireAnon } from "../auth/plugin.js";
import { getClientIp } from "../utils/ip.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { Errors } from "../utils/errors.js";
import { prisma } from "../db.js";

export function registerAnonymousRoutes(app: FastifyInstance): void {
  app.post("/anonymous/register", async (request, reply) => {
    const env = loadEnv();
    const ip = getClientIp(request);
    if (!checkRateLimit(`register:${ip}`, env.RATE_LIMIT_REGISTRATIONS_PER_HOUR, 60 * 60_000)) {
      throw Errors.rateLimited("Too many identities created from this network recently. Please try again later.");
    }

    const body = RegisterRequestSchema.parse(request.body);
    const user = await registerAnonymousUser({
      signingPublicKey: base64urlToBytes(body.signingPublicKey),
      exchangePublicKey: base64urlToBytes(body.exchangePublicKey),
      signingPublicKeyB64: body.signingPublicKey,
      exchangePublicKeyB64: body.exchangePublicKey,
      proof: base64urlToBytes(body.proof),
      ip,
      storeIp: env.STORE_IP_ADDRESSES,
    });

    const token = await createAnonymousSession(user.id, env.STORE_IP_ADDRESSES ? ip : null);
    setAnonSessionCookie(reply, token);

    const adminPublicKeys = await getAdminPublicKeys();
    const response: RegisterResponse = {
      publicId: user.publicId,
      conversationId: user.conversation!.id,
      adminPublicKeys: adminPublicKeys ?? { signingPublicKey: "", exchangePublicKey: "" },
    };
    reply.status(201).send(response);
  });

  app.post("/anonymous/challenge", async (request) => {
    const env = loadEnv();
    const ip = getClientIp(request);
    if (!checkRateLimit(`challenge:${ip}`, env.RATE_LIMIT_REGISTRATIONS_PER_HOUR * 5, 60 * 60_000)) {
      throw Errors.rateLimited("Too many attempts from this network recently. Please try again later.");
    }
    const body = ChallengeRequestSchema.parse(request.body);
    const { challengeId, challenge, expiresAt } = await beginAnonymousLogin(body.publicId);
    const response: ChallengeResponse = { challengeId, challenge, expiresAt: new Date(expiresAt).toISOString() };
    return response;
  });

  app.post("/anonymous/recover", async (request, reply) => {
    const env = loadEnv();
    const ip = getClientIp(request);
    if (!checkRateLimit(`recover:${ip}`, env.RATE_LIMIT_REGISTRATIONS_PER_HOUR * 5, 60 * 60_000)) {
      throw Errors.rateLimited("Too many attempts from this network recently. Please try again later.");
    }
    const body = RecoverRequestSchema.parse(request.body);
    const user = await completeAnonymousLogin({
      publicId: body.publicId,
      challengeId: body.challengeId,
      signature: base64urlToBytes(body.signature),
    });

    const token = await createAnonymousSession(user.id, env.STORE_IP_ADDRESSES ? ip : null);
    setAnonSessionCookie(reply, token);

    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { anonymousUserId: user.id } });
    const adminPublicKeys = await getAdminPublicKeys();
    const response: RegisterResponse = {
      publicId: user.publicId,
      conversationId: conversation.id,
      adminPublicKeys: adminPublicKeys ?? { signingPublicKey: "", exchangePublicKey: "" },
    };
    reply.send(response);
  });

  app.get("/anonymous/me", { preHandler: requireAnon }, async (request) => {
    const user = request.anonUser!;
    const adminPublicKeys = await getAdminPublicKeys();
    const response: MeResponse = {
      publicId: user.publicId,
      conversationId: user.conversation!.id,
      conversationStatus: user.conversation!.status,
      adminPublicKeys: adminPublicKeys ?? { signingPublicKey: "", exchangePublicKey: "" },
    };
    return response;
  });

  app.post("/anonymous/logout", async (request, reply) => {
    const token = request.cookies[ANON_SESSION_COOKIE];
    if (token) {
      await prisma.anonymousSession.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearAnonSessionCookie(reply);
    reply.status(204).send();
  });
}
