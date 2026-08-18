import type { GifResultDto, GifSearchQueryInput } from "@anonchat/shared";
import { getSiteSettings } from "./siteSettings.service.js";

/**
 * GIF search for the composer's picker, proxied through this server so the
 * admin's GIPHY/KLIPY API keys never reach a visitor's browser. Both
 * providers are queried directly with fixed hostnames (no user-controlled
 * URL, so there is no SSRF surface), results are capped, and only media
 * URLs from each provider's own known CDN hosts are returned - that
 * allowlist also keeps the app's img-src CSP closed.
 *
 * KLIPY speaks the Tenor-compatible v1 API (https://docs.klipy.com/gifs-api),
 * which is why it shares the Tenor response shape below.
 */

const GIPHY_MEDIA_HOST = /^https:\/\/media\d*\.giphy\.com\//;
const KLIPY_MEDIA_HOST = /^https:\/\/media\.klipy\.com\//;

const PROVIDER_TIMEOUT_MS = 6_000;

/**
 * The one allowlist for every GIF URL this app will fetch - the search
 * results above AND the media relay (/gifs/media) both pass through it,
 * so the relay has exactly the same (zero) SSRF surface as the search.
 */
export function isAllowedGifMediaUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string") return false;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return GIPHY_MEDIA_HOST.test(url.href) || KLIPY_MEDIA_HOST.test(url.href);
}

interface ProviderResult {
  id: string;
  previewUrl: string;
  gifUrl: string;
}

function allowedMediaUrl(url: unknown, provider: "giphy" | "klipy"): string | null {
  if (typeof url !== "string") return null;
  const hostPattern = provider === "giphy" ? GIPHY_MEDIA_HOST : KLIPY_MEDIA_HOST;
  return hostPattern.test(url) ? url : null;
}

async function searchGiphy(key: string, query: GifSearchQueryInput): Promise<ProviderResult[]> {
  const params = new URLSearchParams({
    api_key: key,
    limit: String(query.limit),
    rating: "r",
  });
  if (query.mode === "search" && query.q) params.set("q", query.q);
  const url = query.mode === "trending" ? `https://api.giphy.com/v1/gifs/trending?${params}` : `https://api.giphy.com/v1/gifs/search?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GIPHY returned HTTP ${response.status}`);
  const json = (await response.json()) as {
    data?: Array<{
      id: string;
      images?: {
        fixed_height_small?: { url?: unknown };
        fixed_height?: { url?: unknown };
        original?: { url?: unknown };
      };
    }>;
  };
  return (json.data ?? []).flatMap((item) => {
    const previewUrl = allowedMediaUrl(item.images?.fixed_height_small?.url, "giphy");
    const gifUrl = allowedMediaUrl(item.images?.original?.url ?? item.images?.fixed_height?.url, "giphy");
    if (!previewUrl || !gifUrl) return [];
    return [{ id: item.id, previewUrl, gifUrl }];
  });
}

/** Tenor-compatible response shape (KLIPY is a drop-in Tenor replacement). */
async function searchKlipy(key: string, query: GifSearchQueryInput): Promise<ProviderResult[]> {
  const params = new URLSearchParams({
    key,
    limit: String(query.limit),
    media_filter: "tinygif,gif",
  });
  if (query.mode === "search" && query.q) params.set("q", query.q);
  const url = query.mode === "trending" ? `https://api.klipy.com/v1/trending?${params}` : `https://api.klipy.com/v1/search?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`KLIPY returned HTTP ${response.status}`);
  const json = (await response.json()) as {
    results?: Array<{
      id: string;
      media_formats?: {
        tinygif?: { url?: unknown };
        gif?: { url?: unknown };
      };
    }>;
  };
  return (json.results ?? []).flatMap((item) => {
    const previewUrl = allowedMediaUrl(item.media_formats?.tinygif?.url, "klipy");
    const gifUrl = allowedMediaUrl(item.media_formats?.gif?.url, "klipy");
    if (!previewUrl || !gifUrl) return [];
    return [{ id: item.id, previewUrl, gifUrl }];
  });
}

export async function searchGifs(query: GifSearchQueryInput): Promise<{ results: GifResultDto[]; error?: string }> {
  const settings = await getSiteSettings();
  const providers: Array<"giphy" | "klipy"> =
    query.provider === "all" ? ["giphy", "klipy"] : [query.provider];

  // "all" searches whichever providers are actually configured and merges
  // the two result lists by interleaving, capped at the requested limit.
  const configured = providers
    .map((provider) => ({ provider, key: provider === "giphy" ? settings.giphyApiKey : settings.klipyApiKey }))
    .filter((entry): entry is { provider: "giphy" | "klipy"; key: string } => Boolean(entry.key));

  if (configured.length === 0) {
    const names = providers.map((provider) => provider.toUpperCase()).join(" and ");
    return { results: [], error: `${names} ${providers.length > 1 ? "are" : "is"} not configured.` };
  }

  const perProviderLimit = query.provider === "all" ? Math.ceil(query.limit / configured.length) : query.limit;
  const settled = await Promise.allSettled(
    configured.map(({ provider, key }) => {
      const providerQuery = { ...query, limit: perProviderLimit };
      return provider === "giphy" ? searchGiphy(key, providerQuery) : searchKlipy(key, providerQuery);
    }),
  );

  if (settled.every((result) => result.status === "rejected")) {
    return { results: [], error: "The GIF providers could not be reached." };
  }

  // Interleave so one provider's results never crowd the other out.
  const lists = settled.map((result) => (result.status === "fulfilled" ? result.value : []));
  const merged: ProviderResult[] = [];
  for (let i = 0; merged.length < query.limit; i++) {
    let added = false;
    for (const list of lists) {
      if (i < list.length && merged.length < query.limit) {
        merged.push(list[i]!);
        added = true;
      }
    }
    if (!added) break;
  }
  return { results: merged };
}
