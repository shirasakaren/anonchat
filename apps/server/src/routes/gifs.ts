import type { FastifyInstance } from "fastify";
import { GifMediaQuerySchema, GifSearchQuerySchema } from "@anonchat/shared";
import { isAllowedGifMediaUrl, searchGifs } from "../services/gifSearch.service.js";
import { readCapped } from "../services/linkPreview/readCapped.js";
import { Errors } from "../utils/errors.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { getCachedBlob, putCachedBlob } from "../utils/blobCache.js";

/** A single GIF relayed through this server must stay reasonable - beyond
 *  this the relay declines instead of buffering something enormous. */
const MAX_GIF_MEDIA_BYTES = 10 * 1024 * 1024;
const GIF_FETCH_TIMEOUT_MS = 6_000;

export function registerGifRoutes(app: FastifyInstance): void {
  app.get("/gifs/search", async (request) => {
    // Both roles share the picker; require at least one authenticated role.
    const viewerKey = request.adminAuth?.admin.id ?? request.anonUser?.id;
    if (!viewerKey) throw Errors.unauthorized();
    if (!checkRateLimit(`gif-search:${viewerKey}`, 30, 60_000)) {
      throw Errors.rateLimited();
    }
    const query = GifSearchQuerySchema.parse(request.query);
    return searchGifs(query);
  });

  // Relays one provider GIF as same-origin bytes. The picker's grid uses
  // this for its thumbnails (media0-9.giphy.com and friends aren't all
  // covered by the CSP img-src allowlist, and the provider never learns
  // the visitor's IP), and the composer uses it to fetch the full GIF for
  // send-as-attachment (connect-src only allows this origin anyway).
  app.get("/gifs/media", async (request, reply) => {
    const viewerKey = request.adminAuth?.admin.id ?? request.anonUser?.id;
    if (!viewerKey) throw Errors.unauthorized();
    if (!checkRateLimit(`gif-media:${viewerKey}`, 120, 60_000)) {
      throw Errors.rateLimited();
    }
    const { url } = GifMediaQuerySchema.parse(request.query);
    if (!isAllowedGifMediaUrl(url)) {
      throw Errors.badRequest("That GIF host is not supported.");
    }

    const cacheKey = `gif-media:${url}`;
    const cached = getCachedBlob(cacheKey);
    if (cached) {
      reply
        .header("Content-Type", "image/gif")
        .header("Cache-Control", "private, max-age=3600")
        .header("Content-Length", String(cached.byteLength))
        .send(cached);
      return;
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(GIF_FETCH_TIMEOUT_MS) });
    if (!response.ok || !response.body) {
      throw Errors.unavailable("The GIF could not be fetched. Try another one.");
    }
    const bytes = await readCapped(response.body.getReader(), MAX_GIF_MEDIA_BYTES, "discard");
    if (!bytes || bytes.byteLength === 0) {
      throw Errors.unavailable("The GIF is too large to send. Try another one.");
    }
    putCachedBlob(cacheKey, Buffer.from(bytes));
    reply
      .header("Content-Type", "image/gif")
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Length", String(bytes.byteLength))
      .send(bytes);
  });
}
