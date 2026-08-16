import type { FastifyInstance } from "fastify";
import { GifSearchQuerySchema } from "@anonchat/shared";
import { searchGifs } from "../services/gifSearch.service.js";
import { Errors } from "../utils/errors.js";
import { checkRateLimit } from "../utils/rateLimiter.js";

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
}
