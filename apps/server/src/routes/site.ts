import type { FastifyInstance } from "fastify";
import { ProfileMediaParamsSchema, type PublicSiteInfoDto } from "@anonchat/shared";
import { loadEnv } from "../env.js";
import { isPushConfigured } from "../push/index.js";
import { isEmailConfigured } from "../email/index.js";
import { adminExists, getAdminPublicKeys } from "../services/admin.service.js";
import { getSiteSettings, toMessagingLimits } from "../services/siteSettings.service.js";
import { getProfileMediaBytes, listProfileMedia, parseProfileMediaRange } from "../services/profileMedia.service.js";

export function registerSiteRoutes(app: FastifyInstance): void {
  app.get("/site", async () => {
    const env = loadEnv();
    const [onboardingComplete, settings, adminPublicKeys, profileMedia] = await Promise.all([
      adminExists(),
      getSiteSettings(),
      getAdminPublicKeys(),
      listProfileMedia(),
    ]);

    const response: PublicSiteInfoDto = {
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
      adminPublicKeys,
      presenceEnabled: settings.presenceEnabled,
      theme: settings.theme,
      limits: toMessagingLimits(settings),
      vapidPublicKey: isPushConfigured() ? env.VAPID_PUBLIC_KEY! : null,
      emailNotificationsAvailable: isEmailConfigured(),
      visitorInsights: {
        enabled: settings.visitorInsightsEnabled,
        retentionDays: settings.visitorInsightsRetentionDays,
        collectsIpAddress: settings.storeIpAddresses,
        coarseGeolocation: settings.visitorGeolocationEnabled,
      },
      gifProviders: {
        giphy: Boolean(settings.giphyApiKey),
        klipy: Boolean(settings.klipyApiKey),
      },
    };
    return response;
  });

  app.get("/site/media/:id", async (request, reply) => {
    const { id } = ProfileMediaParamsSchema.parse(request.params);
    const { media, buffer } = await getProfileMediaBytes(id);
    const range = parseProfileMediaRange(request.headers.range, buffer.byteLength);

    reply
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .type(media.mimetype);

    if (range === "invalid") {
      return reply.code(416).header("Content-Range", `bytes */${buffer.byteLength}`).send();
    }
    if (range) {
      const chunk = buffer.subarray(range.start, range.end + 1);
      return reply
        .code(206)
        .header("Content-Range", `bytes ${range.start}-${range.end}/${buffer.byteLength}`)
        .header("Content-Length", chunk.byteLength)
        .send(chunk);
    }
    return reply.header("Content-Length", buffer.byteLength).send(buffer);
  });
}
