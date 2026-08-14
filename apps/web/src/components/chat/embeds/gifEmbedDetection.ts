/** Hostnames whose "share this gif" page URLs (not a direct .gif file) are
 *  known to expose the actual animated gif as their og:image - the server's
 *  /api/link-preview fetch already resolves that for us (see
 *  fetchLinkPreview.ts), this just decides which URLs are worth trying. */
const GIF_PROVIDER_HOSTS = [/(^|\.)tenor\.com$/i, /(^|\.)giphy\.com$/i, /(^|\.)gfycat\.com$/i];

/** True for a URL that's either a direct .gif file or a known GIF-sharing
 *  provider's page - both routes end up rendered by GifEmbed via the same
 *  server-side fetch (CSP's img-src is 'self'/data:/blob: only, so a raw
 *  third-party image URL can never be set directly as an <img src>). */
export function isGifUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (/\.gif$/i.test(url.pathname)) return true;
  return GIF_PROVIDER_HOSTS.some((pattern) => pattern.test(url.hostname));
}
