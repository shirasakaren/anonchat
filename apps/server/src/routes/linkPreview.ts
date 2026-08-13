import type { FastifyInstance } from "fastify";
import { LinkPreviewQuerySchema, type LinkPreviewDto } from "@anonchat/shared";
import { requireAnyAuth } from "../auth/plugin.js";
import { loadEnv } from "../env.js";
import { fetchLinkPreview } from "../services/linkPreview/fetchLinkPreview.js";
import { getClientIp } from "../utils/ip.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { Errors } from "../utils/errors.js";

export function registerLinkPreviewRoutes(app: FastifyInstance): void {
  app.get("/link-preview", { preHandler: requireAnyAuth }, async (request, reply) => {
    const env = loadEnv();
    if (!env.LINK_PREVIEWS_ENABLED) throw Errors.notFound();

    const ip = getClientIp(request);
    if (!checkRateLimit(`link-preview:${ip}`, env.RATE_LIMIT_LINK_PREVIEWS_PER_MINUTE, 60_000)) {
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
