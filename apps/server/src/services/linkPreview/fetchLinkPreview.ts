import { fetch } from "undici";
import {
  MAX_LINK_PREVIEW_GIF_BYTES,
  MAX_LINK_PREVIEW_IMAGE_BYTES,
  MAX_LINK_PREVIEW_RESPONSE_BYTES,
  type LinkPreviewDto,
} from "@anonchat/shared";
import { createSsrfSafeDispatcher, isUrlSafeToFetch } from "../../security/ssrfGuard.js";
import { extractMetaTags } from "./extractMeta.js";
import { readCapped } from "./readCapped.js";

const FETCH_TIMEOUT_MS = 5_000;
const USER_AGENT = "AnonchatLinkPreviewBot/1.0 (+fetches Open Graph metadata for a link shared in a private chat)";

// Module-level singleton: an Agent pools connections, it isn't per-call
// state, and constructing a fresh one per request would defeat that.
const dispatcher = createSsrfSafeDispatcher();

/** The one safe-fetch chokepoint every outbound request in this module
 *  goes through: scheme + literal-IP pre-check, the SSRF-safe dispatcher
 *  for DNS-hostname requests, a short timeout, and `redirect: "manual"` -
 *  a redirect target hasn't itself been through the pre-check, so instead
 *  of re-validating it (out of scope for now) this just fails closed on
 *  any 3xx rather than following it. A shared link can resolve to either
 *  an HTML page (the common case) or point straight at an image (a bare
 *  .gif URL) - `image/*` is accepted alongside HTML so the latter doesn't
 *  get a 406 from a CDN that actually honors Accept. */
async function safeFetch(url: URL): Promise<Awaited<ReturnType<typeof fetch>> | null> {
  if (!isUrlSafeToFetch(url)) return null;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,image/*;q=0.8" },
      dispatcher,
    });
    // Covers both ordinary non-2xx responses and the opaqueredirect
    // (status 0, ok: false) that `redirect: "manual"` produces for a 3xx -
    // either way, nothing more should be done with this response.
    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
}

/** GIFs (a direct .gif link, or a Tenor/Giphy page's og:image - both
 *  providers point that tag straight at the animated gif, not a static
 *  thumbnail) get a larger read cap than an ordinary OG thumbnail image;
 *  see MAX_LINK_PREVIEW_GIF_BYTES's doc comment. */
function imageByteCap(contentType: string): number {
  return contentType === "image/gif" ? MAX_LINK_PREVIEW_GIF_BYTES : MAX_LINK_PREVIEW_IMAGE_BYTES;
}

async function readResponseAsDataUrl(
  response: Awaited<ReturnType<typeof fetch>>,
  contentType: string,
): Promise<string | null> {
  const bytes = await readCapped(response.body?.getReader(), imageByteCap(contentType), "discard");
  if (!bytes) return null;
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType.split(";")[0]!.trim()};base64,${base64}`;
}

async function fetchImageAsDataUrl(rawImageUrl: string, pageUrl: URL): Promise<string | null> {
  let imageUrl: URL;
  try {
    imageUrl = new URL(rawImageUrl, pageUrl); // resolves a relative og:image against the page's own URL
  } catch {
    return null;
  }
  const response = await safeFetch(imageUrl);
  if (!response) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;

  return readResponseAsDataUrl(response, contentType.split(";")[0]!.trim());
}

/**
 * Fetches Open Graph / Twitter Card metadata for a link a user shared in a
 * conversation, entirely server-side and SSRF-guarded (see
 * security/ssrfGuard.ts). This is a deliberate, narrow exception to "the
 * server never learns what's inside a conversation" - see
 * MAX_LINK_PREVIEW_RESPONSE_BYTES's doc comment and docs/ARCHITECTURE.md.
 * Returns null (never throws) for anything unfetchable, non-HTML, or with
 * no usable metadata - link previews are a UI nicety, not something a
 * caller should have to handle failure modes for individually.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewDto | null> {
  let pageUrl: URL;
  try {
    pageUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  const pageResponse = await safeFetch(pageUrl);
  if (!pageResponse) return null;

  const contentType = pageResponse.headers.get("content-type") ?? "";

  // A shared URL can point straight at an image instead of an HTML page -
  // a bare .gif link being the motivating case (GifEmbed.tsx on the client
  // detects these by extension and always calls this endpoint, since the
  // asset still has to come back as a same-origin data: URI to clear the
  // img-src CSP). There's no OG metadata to extract here; the URL itself
  // is the asset, read and inlined the same way an og:image result is.
  if (contentType.startsWith("image/")) {
    const image = await readResponseAsDataUrl(pageResponse, contentType.split(";")[0]!.trim());
    if (!image) return null;
    return { url: pageUrl.toString(), title: null, description: null, image, siteName: null };
  }

  // Defense in depth: don't trust the Accept header request to have been
  // honored - never attempt to parse a non-HTML response as metadata, and
  // don't let this endpoint be (ab)used to fetch/characterize arbitrary
  // internal file types even if the IP-range gate were somehow bypassed.
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;

  const bodyBytes = await readCapped(pageResponse.body?.getReader(), MAX_LINK_PREVIEW_RESPONSE_BYTES, "truncate");
  if (!bodyBytes) return null;

  const html = new TextDecoder("utf-8", { fatal: false }).decode(bodyBytes);
  const meta = extractMetaTags(html);

  const image = meta.imageUrl ? await fetchImageAsDataUrl(meta.imageUrl, pageUrl) : null;

  if (!meta.title && !meta.description && !image) return null;

  return {
    url: pageUrl.toString(),
    title: meta.title,
    description: meta.description,
    image,
    siteName: meta.siteName,
  };
}
