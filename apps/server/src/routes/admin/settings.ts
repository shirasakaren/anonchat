import type { FastifyInstance } from "fastify";
import { SiteSettingsRequestSchema, type SiteSettingsDto } from "@termine/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { prisma } from "../../db.js";
import { adminExists, getAdminPublicKeys } from "../../services/admin.service.js";
import { recordAudit } from "../../services/auditLog.service.js";
import { getSiteSettings } from "../../services/siteSettings.service.js";
import { Errors } from "../../utils/errors.js";

const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_AVATAR_BYTES = 2_000_000;

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
    adminPublicKeys,
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
      },
    });
    await recordAudit(admin.id, "settings.updated");
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
}
