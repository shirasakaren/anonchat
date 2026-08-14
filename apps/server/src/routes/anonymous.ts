import type { FastifyInstance } from "fastify";
import { base64urlToBytes } from "@anonchat/crypto";
import {
  ANON_SESSION_COOKIE,
  ChallengeRequestSchema,
  NotificationEmailRequestSchema,
  PushSubscriptionRequestSchema,
  PushUnsubscribeRequestSchema,
  RecoverRequestSchema,
  RegisterRequestSchema,
} from "@anonchat/shared";
import type { ChallengeResponse, MeResponse, RegisterResponse } from "@anonchat/shared";
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
import { requireAnon, requireAnonIdentity } from "../auth/plugin.js";
import { getClientIp } from "../utils/ip.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { Errors } from "../utils/errors.js";
import { prisma } from "../db.js";
import { hardDeleteConversation } from "../services/conversation.service.js";
import { isEmailConfigured } from "../email/index.js";
import { isPushConfigured } from "../push/index.js";

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

  app.delete("/anonymous/me", { preHandler: requireAnonIdentity }, async (request, reply) => {
    const conversationId = request.anonUser!.conversation?.id;
    if (!conversationId) throw Errors.notFound("Conversation not found.");
    await hardDeleteConversation(conversationId);
    clearAnonSessionCookie(reply);
    reply.status(204).send();
  });

  // Entirely optional (spec: "tell that it's fully optional"): stores an
  // email purely so this identity can be notified when the admin replies.
  // Never required, never shown to the admin as a contact method, never
  // used for anything but this one notification.
  app.post("/anonymous/notification-email", { preHandler: requireAnon }, async (request, reply) => {
    if (!isEmailConfigured()) {
      throw Errors.unavailable("Email notifications are not configured on this server.");
    }
    const user = request.anonUser!;
    const { email } = NotificationEmailRequestSchema.parse(request.body);
    await prisma.anonymousUser.update({
      where: { id: user.id },
      data: { notificationEmail: email || null },
    });
    reply.status(204).send();
  });

  app.get("/anonymous/notification-preferences", { preHandler: requireAnonIdentity }, (request) => ({
    emailNotificationsAvailable: isEmailConfigured(),
    notificationEmail: request.anonUser!.notificationEmail,
  }));

  // Web Push registration for this identity's own device - entirely the
  // visitor's own opt-in, no admin-side toggle (see pushNotification.service.ts).
  app.post("/anonymous/push/subscribe", { preHandler: requireAnon }, async (request, reply) => {
    if (!isPushConfigured()) throw Errors.unavailable("Push notifications are not configured on this server.");
    const user = request.anonUser!;
    const body = PushSubscriptionRequestSchema.parse(request.body);
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        anonymousUserId: user.id,
        adminId: null,
      },
      // Preserve admin ownership when one browser is used for both sides;
      // PushManager exposes one subscription per service worker/origin.
      update: { p256dh: body.keys.p256dh, auth: body.keys.auth, anonymousUserId: user.id },
    });
    reply.status(204).send();
  });

  app.post("/anonymous/push/unsubscribe", { preHandler: requireAnon }, async (request, reply) => {
    const user = request.anonUser!;
    const { endpoint } = PushUnsubscribeRequestSchema.parse(request.body);
    const subscription = await prisma.pushSubscription.findFirst({ where: { endpoint, anonymousUserId: user.id } });
    let unsubscribeBrowser = true;
    if (subscription) {
      if (subscription.adminId) {
        await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { anonymousUserId: null } });
        unsubscribeBrowser = false;
      } else {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } });
      }
    }
    reply.send({ unsubscribeBrowser });
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
