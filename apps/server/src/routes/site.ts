import type { FastifyInstance } from "fastify";
import type { PublicSiteInfoDto } from "@anonchat/shared";
import { loadEnv } from "../env.js";
import { isPushConfigured } from "../push/index.js";
import { isEmailConfigured } from "../email/index.js";
import { adminExists, getAdminPublicKeys } from "../services/admin.service.js";
import { getSiteSettings, toMessagingLimits } from "../services/siteSettings.service.js";

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
      siteTitle: settings.siteTitle,
      displayName: settings.displayName,
      bio: settings.bio,
      welcomeMessage: settings.welcomeMessage,
      avatarUrl: settings.avatarUrl,
      profilePhotos: Array.isArray(settings.profilePhotosJson)
        ? settings.profilePhotosJson.filter((value): value is string => typeof value === "string")
        : [],
      contactLinks: (settings.contactLinksJson as { label: string; url: string }[]) ?? [],
      pgpPublicKey: settings.pgpPublicKey,
      privacyPolicyUrl: settings.privacyPolicyUrl,
      adminPublicKeys,
      presenceEnabled: settings.presenceEnabled,
      theme: settings.theme,
      limits: toMessagingLimits(settings),
      turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null,
      vapidPublicKey: isPushConfigured() ? env.VAPID_PUBLIC_KEY! : null,
      emailNotificationsAvailable: isEmailConfigured(),
      visitorInsights: {
        enabled: settings.visitorInsightsEnabled,
        retentionDays: settings.visitorInsightsRetentionDays,
        collectsIpAddress: settings.storeIpAddresses,
        coarseGeolocation: settings.visitorGeolocationEnabled,
      },
    };
    return response;
  });
}
