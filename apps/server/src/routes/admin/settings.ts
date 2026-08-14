import type { FastifyInstance } from "fastify";
import { GravatarImportRequestSchema, SiteSettingsRequestSchema, type SiteSettingsDto } from "@anonchat/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { prisma } from "../../db.js";
import { publishToAllAnonymousUsers, publishToAdmins } from "../../realtime/hub.js";
import { adminExists, getAdminPublicKeys } from "../../services/admin.service.js";
import { recordAudit } from "../../services/auditLog.service.js";
import { isEmailConfigured } from "../../email/index.js";
import { isPushConfigured } from "../../push/index.js";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_BYTES, fetchGravatarAvatarDataUrl } from "../../services/gravatar.js";
import { getSiteSettings } from "../../services/siteSettings.service.js";
import { Errors } from "../../utils/errors.js";

async function toSettingsDto(): Promise<SiteSettingsDto> {
  const [settings, onboardingComplete, adminPublicKeys] = await Promise.all([
    getSiteSettings(),
    adminExists(),
    getAdminPublicKeys(),
  ]);
  return {
    onboardingComplete,
    displayName: settings.displayName,
    bio: settings.bio,
    avatarUrl: settings.avatarUrl,
    contactLinks: (settings.contactLinksJson as { label: string; url: string }[]) ?? [],
    pgpPublicKey: settings.pgpPublicKey,
    presenceEnabled: settings.presenceEnabled,
    theme: settings.theme,
    adminPublicKeys,
    emailNotificationsAvailable: isEmailConfigured(),
    adminNotificationEmail: settings.adminNotificationEmail,
    adminEmailDigestEnabled: settings.adminEmailDigestEnabled,
    adminEmailDigestIntervalMinutes: settings.adminEmailDigestIntervalMinutes,
    pushNotificationsAvailable: isPushConfigured(),
    adminPushEnabled: settings.adminPushEnabled,
  };
}

export function registerAdminSettingsRoutes(app: FastifyInstance): void {
  app.get("/admin/settings", { preHandler: requireAdmin }, async () => toSettingsDto());

  app.patch("/admin/settings", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const body = SiteSettingsRequestSchema.parse(request.body);
    const settings = await getSiteSettings();
    await prisma.siteSettings.update({
      where: { id: settings.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.contactLinks !== undefined ? { contactLinksJson: body.contactLinks } : {}),
        ...(body.pgpPublicKey !== undefined ? { pgpPublicKey: body.pgpPublicKey || null } : {}),
        ...(body.presenceEnabled !== undefined ? { presenceEnabled: body.presenceEnabled } : {}),
        ...(body.theme !== undefined ? { theme: body.theme } : {}),
        ...(body.adminNotificationEmail !== undefined
          ? { adminNotificationEmail: body.adminNotificationEmail || null }
          : {}),
        ...(body.adminEmailDigestEnabled !== undefined
          ? { adminEmailDigestEnabled: body.adminEmailDigestEnabled }
          : {}),
        ...(body.adminEmailDigestIntervalMinutes !== undefined
          ? { adminEmailDigestIntervalMinutes: body.adminEmailDigestIntervalMinutes }
          : {}),
        ...(body.adminPushEnabled !== undefined ? { adminPushEnabled: body.adminPushEnabled } : {}),
      },
    });
    await recordAudit(admin.id, "settings.updated");
    // Push the new theme live to every open tab (anonymous visitors and any
    // other admin session) instead of making them wait for their next load.
    if (body.theme !== undefined && body.theme !== settings.theme) {
      const event = { type: "site.updated" as const, theme: body.theme };
      publishToAllAnonymousUsers(event);
      publishToAdmins(event);
    }
    reply.send(await toSettingsDto());
  });

  app.post("/admin/avatar", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const file = await request.file({ limits: { fileSize: MAX_AVATAR_BYTES } }).catch(() => null);
    if (!file) throw Errors.badRequest("No image uploaded.");
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      throw Errors.badRequest("Avatar must be a PNG, JPEG, WebP, or GIF image.");
    }
    const buffer = await file.toBuffer().catch(() => {
      throw Errors.tooLarge("Avatar images must be 2MB or smaller.");
    });
    const dataUrl = `data:${file.mimetype};base64,${buffer.toString("base64")}`;
    const settings = await getSiteSettings();
    await prisma.siteSettings.update({ where: { id: settings.id }, data: { avatarUrl: dataUrl } });
    await recordAudit(admin.id, "settings.avatar_updated");
    reply.send(await toSettingsDto());
  });

  // Imports ONLY the profile picture from Gravatar - never the name/bio
  // Gravatar also exposes. Fetched server-side (see gravatar.ts) so the
  // admin's own email is never sent client-side to a third party, and so
  // visitors never hot-link gravatar.com through the site's avatar <img>.
  app.post("/admin/avatar/gravatar", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const { email } = GravatarImportRequestSchema.parse(request.body);
    const dataUrl = await fetchGravatarAvatarDataUrl(email);
    if (!dataUrl) {
      throw Errors.notFound("No Gravatar image found for that email.");
    }
    const settings = await getSiteSettings();
    await prisma.siteSettings.update({ where: { id: settings.id }, data: { avatarUrl: dataUrl } });
    await recordAudit(admin.id, "settings.avatar_imported_gravatar");
    reply.send(await toSettingsDto());
  });
}
