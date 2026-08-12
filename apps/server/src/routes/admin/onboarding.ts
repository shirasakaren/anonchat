import type { FastifyInstance } from "fastify";
import { base64urlToBytes } from "@anonchat/crypto";
import { OnboardingRequestSchema } from "@anonchat/shared";
import { createAdminSession, setAdminSessionCookie } from "../../auth/session.js";
import { prisma } from "../../db.js";
import { onboardAdmin } from "../../services/admin.service.js";
import { recordAudit } from "../../services/auditLog.service.js";
import { getSiteSettings } from "../../services/siteSettings.service.js";
import { getClientIp } from "../../utils/ip.js";

export function registerOnboardingRoutes(app: FastifyInstance): void {
  app.post("/admin/onboarding", async (request, reply) => {
    const body = OnboardingRequestSchema.parse(request.body);
    const admin = await onboardAdmin({
      username: body.username,
      password: body.password,
      displayName: body.displayName,
      signingPublicKey: base64urlToBytes(body.signingPublicKey),
      exchangePublicKey: base64urlToBytes(body.exchangePublicKey),
      signingPublicKeyB64: body.signingPublicKey,
      exchangePublicKeyB64: body.exchangePublicKey,
      proof: base64urlToBytes(body.proof),
    });

    const settings = await getSiteSettings();
    await prisma.siteSettings.update({
      where: { id: settings.id },
      data: {
        displayName: body.displayName,
        ...(body.theme ? { theme: body.theme } : {}),
      },
    });

    const { token } = await createAdminSession(admin.id, getClientIp(request), request.headers["user-agent"] ?? null);
    setAdminSessionCookie(reply, token);
    await recordAudit(admin.id, "admin.onboarded");

    reply.status(201).send({ id: admin.id, username: admin.username, displayName: admin.displayName });
  });
}
