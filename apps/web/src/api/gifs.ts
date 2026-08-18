import type { GifResultDto } from "@anonchat/shared";
import { api } from "./client.js";

export function searchGifs(params: {
  provider: "giphy" | "klipy" | "all";
  mode: "trending" | "search";
  q?: string;
  limit?: number;
}): Promise<{ results: GifResultDto[]; error?: string }> {
  const query = new URLSearchParams({
    provider: params.provider,
    mode: params.mode,
    limit: String(params.limit ?? 24),
  });
  if (params.q) query.set("q", params.q);
  return api.get(`/gifs/search?${query.toString()}`);
}

/**
 * Same-origin URL for one provider GIF (picker thumbnail or the full GIF
 * for sending). The server relays the bytes so the provider never learns
 * the visitor, CSP's img-src/connect-src stay closed, and the picker's
 * grid never shows broken images from GIPHY's media0-9 subdomains.
 */
export function gifMediaUrl(providerUrl: string): string {
  return `/api/gifs/media?url=${encodeURIComponent(providerUrl)}`;
}
