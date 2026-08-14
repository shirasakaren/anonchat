import type { FastifyInstance } from "fastify";
import type { PublicSiteInfoDto } from "@anonchat/shared";
import { loadEnv } from "../env.js";
import { isPushConfigured } from "../push/index.js";
import { adminExists, getAdminPublicKeys } from "../services/admin.service.js";
import { getSiteSettings } from "../services/siteSettings.service.js";

export function registerSiteRoutes(app: FastifyInstance): void {
  app.get("/site", async () => {
    const env = loadEnv();
    const [onboardingComplete, settings, adminPublicKeys] = await Promise.all([
      adminExists(),
      getSiteSettings(),
      getAdminPublicKeys(),
    ]);

    const response: PublicSiteInfoDto = {
      onboardingComplete,
      displayName: settings.displayName,
      bio: settings.bio,
      welcomeMessage: settings.welcomeMessage,
      avatarUrl: settings.avatarUrl,
      contactLinks: (settings.contactLinksJson as { label: string; url: string }[]) ?? [],
      pgpPublicKey: settings.pgpPublicKey,
      adminPublicKeys,
      presenceEnabled: settings.presenceEnabled,
      theme: settings.theme,
      limits: {
        maxMessageLength: env.MAX_MESSAGE_LENGTH,
        maxAttachmentSizeMb: env.MAX_ATTACHMENT_SIZE_MB,
        maxAttachmentsPerMessage: env.MAX_ATTACHMENTS_PER_MESSAGE,
        messageEditWindowMinutes: env.MESSAGE_EDIT_WINDOW_MINUTES,
      },
      turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null,
      vapidPublicKey: isPushConfigured() ? env.VAPID_PUBLIC_KEY! : null,
    };
    return response;
  });
}
