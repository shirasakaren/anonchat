import type { FastifyInstance } from "fastify";
import {
  ADMIN_SESSION_COOKIE,
  AdminLoginRequestSchema,
  IdParamSchema,
  TotpVerifyRequestSchema,
} from "@anonchat/shared";
import type { AdminSummaryDto } from "@anonchat/shared";
import { requireAdmin } from "../../auth/plugin.js";
import {
  clearAdminSessionCookie,
  createAdminSession,
  hashSessionToken,
  revokeAdminSession,
  setAdminSessionCookie,
} from "../../auth/session.js";
import { prisma } from "../../db.js";
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  getAdminPublicKeys,
  listAdminSessions,
  verifyAdminLogin,
} from "../../services/admin.service.js";
import { recordAudit } from "../../services/auditLog.service.js";
import { Errors } from "../../utils/errors.js";
import { getClientIp } from "../../utils/ip.js";
import { checkRateLimit } from "../../utils/rateLimiter.js";

export function registerAdminAuthRoutes(app: FastifyInstance): void {
  app.post("/admin/login", async (request, reply) => {
    const ip = getClientIp(request);
    const body = AdminLoginRequestSchema.parse(request.body);
    if (!checkRateLimit(`admin-login:${ip}:${body.username}`, 10, 15 * 60_000)) {
      throw Errors.rateLimited("Too many login attempts. Please wait a few minutes and try again.");
    }

    const admin = await verifyAdminLogin(body.username, body.password, body.totpCode);
    const { token } = await createAdminSession(admin.id, ip, request.headers["user-agent"] ?? null);
    setAdminSessionCookie(reply, token);
    await recordAudit(admin.id, "admin.login");
    reply.send({ id: admin.id, username: admin.username, displayName: admin.displayName });
  });

  app.post("/admin/logout", { preHandler: requireAdmin }, async (request, reply) => {
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    if (token) {
      await prisma.adminSession.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearAdminSessionCookie(reply);
    reply.status(204).send();
  });

  app.get("/admin/me", { preHandler: requireAdmin }, async (request) => {
    const { admin } = request.adminAuth!;
    const publicKeys = await getAdminPublicKeys();
    const response: AdminSummaryDto = {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      avatarUrl: admin.avatarUrl,
      totpEnabled: admin.totpEnabled,
      publicKeys: publicKeys ?? { signingPublicKey: "", exchangePublicKey: "" },
    };
    return response;
  });

  app.get("/admin/sessions", { preHandler: requireAdmin }, async (request) => {
    const { admin, sessionId } = request.adminAuth!;
    return listAdminSessions(admin.id, sessionId);
  });

  app.delete("/admin/sessions/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = IdParamSchema.parse(request.params);
    const revoked = await revokeAdminSession(params.id, admin.id);
    if (!revoked) throw Errors.notFound();
    await recordAudit(admin.id, "admin.session.revoked", { type: "AdminSession", id: params.id });
    reply.status(204).send();
  });

  app.post("/admin/totp/setup", { preHandler: requireAdmin }, async (request) => {
    const { admin } = request.adminAuth!;
    return beginTotpSetup(admin.id);
  });

  app.post("/admin/totp/verify", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const body = TotpVerifyRequestSchema.parse(request.body);
    await confirmTotpSetup(admin.id, body.code);
    await recordAudit(admin.id, "admin.totp.enabled");
    reply.status(204).send();
  });

  app.post("/admin/totp/disable", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    await disableTotp(admin.id);
    await recordAudit(admin.id, "admin.totp.disabled");
    reply.status(204).send();
  });
}
