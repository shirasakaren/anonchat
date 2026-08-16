import type { GifResultDto } from "@anonchat/shared";
import { api } from "./client.js";

export function searchGifs(params: {
  provider: "giphy" | "klipy";
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
