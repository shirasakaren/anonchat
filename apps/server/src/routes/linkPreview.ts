import type { FastifyInstance } from "fastify";
import { LinkPreviewQuerySchema, type LinkPreviewDto } from "@anonchat/shared";
import { requireAnyAuth } from "../auth/plugin.js";
import { fetchLinkPreview } from "../services/linkPreview/fetchLinkPreview.js";
import { getClientIp } from "../utils/ip.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { Errors } from "../utils/errors.js";
import { getSiteSettings } from "../services/siteSettings.service.js";

export function registerLinkPreviewRoutes(app: FastifyInstance): void {
  app.get("/link-preview", { preHandler: requireAnyAuth }, async (request, reply) => {
    const settings = await getSiteSettings();
    if (!settings.linkPreviewsEnabled) throw Errors.notFound();

    const ip = getClientIp(request);
    if (!checkRateLimit(`link-preview:${ip}`, settings.rateLimitLinkPreviewsPerMinute, 60_000)) {
      throw Errors.rateLimited("Too many link previews requested. Please try again shortly.");
    }

    const { url } = LinkPreviewQuerySchema.parse(request.query);
    const preview = await fetchLinkPreview(url);
    if (!preview) {
      reply.status(204).send();
      return;
    }
    const response: LinkPreviewDto = preview;
    reply.send(response);
  });
}
