import type { FastifyInstance } from "fastify";
import {
  GravatarImportRequestSchema,
  ProfileMediaOrderRequestSchema,
  ProfileMediaParamsSchema,
  SiteSettingsRequestSchema,
  type SiteSettingsDto,
} from "@anonchat/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { prisma } from "../../db.js";
import { publishToAllAnonymousUsers, publishToAdmins } from "../../realtime/hub.js";
import { adminExists, getAdminPublicKeys } from "../../services/admin.service.js";
import { recordAudit } from "../../services/auditLog.service.js";
import { isEmailConfigured } from "../../email/index.js";
import { isPushConfigured } from "../../push/index.js";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_BYTES, fetchGravatarAvatarDataUrl } from "../../services/gravatar.js";
import { getSiteSettings, toMessagingLimits } from "../../services/siteSettings.service.js";
import {
  MAX_PROFILE_MEDIA_ITEMS,
  addProfileMedia,
  listProfileMedia,
  profileMediaKindForMime,
  readProfileMediaBuffer,
  removeProfileMedia,
  reorderProfileMedia,
} from "../../services/profileMedia.service.js";
import { Errors } from "../../utils/errors.js";

const BYTES_PER_MB = 1024 * 1024;

async function toSettingsDto(): Promise<SiteSettingsDto> {
  const [settings, onboardingComplete, adminPublicKeys, profileMedia] = await Promise.all([
    getSiteSettings(),
    adminExists(),
    getAdminPublicKeys(),
    listProfileMedia(),
  ]);
  return {
    onboardingComplete,
    siteTitle: settings.siteTitle,
    displayName: settings.displayName,
    bio: settings.bio,
    welcomeMessage: settings.welcomeMessage,
    avatarUrl: settings.avatarUrl,
    profileMedia,
    contactLinks: (settings.contactLinksJson as { label: string; url: string }[]) ?? [],
    pgpPublicKey: settings.pgpPublicKey,
    privacyPolicyUrl: settings.privacyPolicyUrl,
    presenceEnabled: settings.presenceEnabled,
    theme: settings.theme,
    adminPublicKeys,
    emailNotificationsAvailable: isEmailConfigured(),
    adminNotificationEmail: settings.adminNotificationEmail,
    adminEmailDigestEnabled: settings.adminEmailDigestEnabled,
    adminEmailDigestIntervalMinutes: settings.adminEmailDigestIntervalMinutes,
    pushNotificationsAvailable: isPushConfigured(),
    adminPushEnabled: settings.adminPushEnabled,
    visitorInsightsEnabled: settings.visitorInsightsEnabled,
    visitorInsightsRetentionDays: settings.visitorInsightsRetentionDays,
    limits: toMessagingLimits(settings),
    rateLimitMessagesPerMinute: settings.rateLimitMessagesPerMinute,
    rateLimitRegistrationsPerHour: settings.rateLimitRegistrationsPerHour,
    rateLimitLinkPreviewsPerMinute: settings.rateLimitLinkPreviewsPerMinute,
    linkPreviewsEnabled: settings.linkPreviewsEnabled,
    storeIpAddresses: settings.storeIpAddresses,
    visitorGeolocationEnabled: settings.visitorGeolocationEnabled,
    adminDigestMinIntervalMinutes: settings.adminDigestMinIntervalMinutes,
    replyEmailMinIntervalMinutes: settings.replyEmailMinIntervalMinutes,
    giphyApiKey: settings.giphyApiKey,
    klipyApiKey: settings.klipyApiKey,
  };
}

export function registerAdminSettingsRoutes(app: FastifyInstance): void {
  app.get("/admin/settings", { preHandler: requireAdmin }, async () => toSettingsDto());

  app.patch("/admin/settings", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const body = SiteSettingsRequestSchema.parse(request.body);
    if (
      !isEmailConfigured() &&
      (body.adminEmailDigestEnabled === true ||
        (body.adminNotificationEmail !== undefined && body.adminNotificationEmail !== ""))
    ) {
      throw Errors.unavailable("Configure SMTP or Resend before enabling admin email notifications.");
    }
    if (!isPushConfigured() && body.adminPushEnabled === true) {
      throw Errors.unavailable("Configure VAPID keys before enabling admin push notifications.");
    }
    const settings = await getSiteSettings();
    await prisma.siteSettings.update({
      where: { id: settings.id },
      data: {
        ...(body.siteTitle !== undefined ? { siteTitle: body.siteTitle } : {}),
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.welcomeMessage !== undefined ? { welcomeMessage: body.welcomeMessage } : {}),
        ...(body.contactLinks !== undefined ? { contactLinksJson: body.contactLinks } : {}),
        ...(body.pgpPublicKey !== undefined ? { pgpPublicKey: body.pgpPublicKey || null } : {}),
        ...(body.privacyPolicyUrl !== undefined ? { privacyPolicyUrl: body.privacyPolicyUrl || null } : {}),
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
        ...(body.visitorInsightsEnabled !== undefined ? { visitorInsightsEnabled: body.visitorInsightsEnabled } : {}),
        ...(body.visitorInsightsRetentionDays !== undefined
          ? { visitorInsightsRetentionDays: body.visitorInsightsRetentionDays }
          : {}),
        ...(body.maxMessageLength !== undefined ? { maxMessageLength: body.maxMessageLength } : {}),
        ...(body.maxAttachmentSizeMb !== undefined ? { maxAttachmentSizeMb: body.maxAttachmentSizeMb } : {}),
        ...(body.maxImageAttachmentSizeMb !== undefined
          ? { maxImageAttachmentSizeMb: body.maxImageAttachmentSizeMb }
          : {}),
        ...(body.maxVideoAttachmentSizeMb !== undefined
          ? { maxVideoAttachmentSizeMb: body.maxVideoAttachmentSizeMb }
          : {}),
        ...(body.maxAudioAttachmentSizeMb !== undefined
          ? { maxAudioAttachmentSizeMb: body.maxAudioAttachmentSizeMb }
          : {}),
        ...(body.maxDocumentAttachmentSizeMb !== undefined
          ? { maxDocumentAttachmentSizeMb: body.maxDocumentAttachmentSizeMb }
          : {}),
        ...(body.maxOtherAttachmentSizeMb !== undefined
          ? { maxOtherAttachmentSizeMb: body.maxOtherAttachmentSizeMb }
          : {}),
        ...(body.maxAttachmentsPerMessage !== undefined
          ? { maxAttachmentsPerMessage: body.maxAttachmentsPerMessage }
          : {}),
        ...(body.messageEditWindowMinutes !== undefined
          ? { messageEditWindowMinutes: body.messageEditWindowMinutes }
          : {}),
        ...(body.rateLimitMessagesPerMinute !== undefined
          ? { rateLimitMessagesPerMinute: body.rateLimitMessagesPerMinute }
          : {}),
        ...(body.rateLimitRegistrationsPerHour !== undefined
          ? { rateLimitRegistrationsPerHour: body.rateLimitRegistrationsPerHour }
          : {}),
        ...(body.rateLimitLinkPreviewsPerMinute !== undefined
          ? { rateLimitLinkPreviewsPerMinute: body.rateLimitLinkPreviewsPerMinute }
          : {}),
        ...(body.linkPreviewsEnabled !== undefined ? { linkPreviewsEnabled: body.linkPreviewsEnabled } : {}),
        ...(body.storeIpAddresses !== undefined ? { storeIpAddresses: body.storeIpAddresses } : {}),
        ...(body.visitorGeolocationEnabled !== undefined
          ? { visitorGeolocationEnabled: body.visitorGeolocationEnabled }
          : {}),
        ...(body.adminDigestMinIntervalMinutes !== undefined
          ? { adminDigestMinIntervalMinutes: body.adminDigestMinIntervalMinutes }
          : {}),
        ...(body.replyEmailMinIntervalMinutes !== undefined
          ? { replyEmailMinIntervalMinutes: body.replyEmailMinIntervalMinutes }
          : {}),
        ...(body.giphyApiKey !== undefined ? { giphyApiKey: body.giphyApiKey || null } : {}),
        ...(body.klipyApiKey !== undefined ? { klipyApiKey: body.klipyApiKey || null } : {}),
      },
    });
    if (body.visitorInsightsEnabled === false) {
      await prisma.visitorInsight.deleteMany();
    }
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

  app.post("/admin/profile-media", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const settings = await getSiteSettings();
    const limits = toMessagingLimits(settings).attachmentSize;
    const currentCount = await prisma.profileMedia.count();
    if (currentCount >= MAX_PROFILE_MEDIA_ITEMS) {
      throw Errors.badRequest(`You can add up to ${MAX_PROFILE_MEDIA_ITEMS} profile media items.`);
    }

    const file = await request
      .file({ limits: { fileSize: limits.globalMb * BYTES_PER_MB, files: 1 } })
      .catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") {
          throw Errors.tooLarge(`Profile media must be ${limits.globalMb} MB or smaller.`);
        }
        throw error;
      });
    if (!file) throw Errors.badRequest("No media uploaded.");
    const kind = profileMediaKindForMime(file.mimetype);
    if (!kind) {
      throw Errors.badRequest("Media must be a PNG, JPEG, WebP, GIF, AVIF, MP4, WebM, OGG, or MOV file.");
    }

    const categoryLimitMb = kind === "VIDEO" ? limits.videoMb : limits.imageMb;
    const buffer = await readProfileMediaBuffer(
      file.file,
      categoryLimitMb * BYTES_PER_MB,
      `Profile ${kind === "VIDEO" ? "videos" : "images"} must be ${categoryLimitMb} MB or smaller.`,
    );
    if (file.file.truncated) {
      throw Errors.tooLarge(`Profile media must be ${limits.globalMb} MB or smaller.`);
    }
    const created = await addProfileMedia({ kind, mimetype: file.mimetype, filename: file.filename, buffer });
    await recordAudit(
      admin.id,
      "settings.profile_media_added",
      { type: "ProfileMedia", id: created.id },
      { kind: kind.toLowerCase() },
    );
    reply.send(await toSettingsDto());
  });

  app.delete("/admin/profile-media/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const { id } = ProfileMediaParamsSchema.parse(request.params);
    const { storageCleanupFailed } = await removeProfileMedia(id);
    if (storageCleanupFailed) request.log.warn({ profileMediaId: id }, "Profile media storage cleanup failed");
    await recordAudit(admin.id, "settings.profile_media_removed", { type: "ProfileMedia", id });
    reply.status(204).send();
  });

  app.put("/admin/profile-media/order", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const { ids } = ProfileMediaOrderRequestSchema.parse(request.body);
    await reorderProfileMedia(ids);
    await recordAudit(admin.id, "settings.profile_media_reordered");
    reply.send(await toSettingsDto());
  });
}
