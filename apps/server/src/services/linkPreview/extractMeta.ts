const META_TAG_RE = /<meta\s+[^>]*>/gi;
const TITLE_TAG_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const MAX_FIELD_LENGTH = 300;
const MAX_URL_LENGTH = 2048;

function getAttr(tag: string, attrName: string): string | null {
  const re = new RegExp(`${attrName}\\s*=\\s*("([^"]*)"|'([^']*)'|(\\S+))`, "i");
  const match = re.exec(tag);
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? null;
}

function decodeHtmlEntities(text: string): string {
  // &amp; must decode last - it's the escape character other entities
  // themselves are built from (e.g. an already-escaped "&amp;lt;").
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** For human-readable text fields - truncates rather than rejecting, since
 *  a page with a 500-character title is still worth previewing. */
function cleanText(raw: string | null): string | null {
  if (!raw) return null;
  const decoded = decodeHtmlEntities(raw).trim();
  if (!decoded) return null;
  return decoded.length > MAX_FIELD_LENGTH ? `${decoded.slice(0, MAX_FIELD_LENGTH)}…` : decoded;
}

/** For the image URL - truncating a URL would just corrupt it, so an
 *  over-length one is dropped entirely rather than mangled. Resolution
 *  against the page's base URL (relative -> absolute) happens one layer up
 *  in the service, which is the only place that knows the request's
 *  original URL. */
function cleanUrl(raw: string | null): string | null {
  if (!raw) return null;
  const decoded = decodeHtmlEntities(raw).trim();
  if (!decoded || decoded.length > MAX_URL_LENGTH) return null;
  return decoded;
}

export interface ExtractedMeta {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

/**
 * Extracts Open Graph / Twitter Card / plain <title>+<meta name="description">
 * metadata via regex over the raw HTML string - never parses it into a DOM,
 * never executes any script or stylesheet in it. The HTML itself is
 * attacker-controlled (it's whatever the target server returned), so this
 * only ever reads specific attribute values out of specific tags; nothing
 * about the page's structure or content flows through unexamined.
 */
export function extractMetaTags(html: string): ExtractedMeta {
  // OG/Twitter tags always live in <head>, which is always near the top of
  // a well-formed document - bounds the regex work against a huge response
  // even before the caller's own byte cap on the fetch itself kicks in.
  const head = html.slice(0, 100_000);

  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogImage: string | null = null;
  let ogSiteName: string | null = null;
  let twitterTitle: string | null = null;
  let twitterDescription: string | null = null;
  let twitterImage: string | null = null;
  let plainDescription: string | null = null;

  for (const tag of head.match(META_TAG_RE) ?? []) {
    const property = getAttr(tag, "property")?.toLowerCase();
    const name = getAttr(tag, "name")?.toLowerCase();
    const content = getAttr(tag, "content");
    if (!content) continue;

    switch (property) {
      case "og:title":
        ogTitle = content;
        break;
      case "og:description":
        ogDescription = content;
        break;
      case "og:image":
      case "og:image:url":
      case "og:image:secure_url":
        ogImage ??= content;
        break;
      case "og:site_name":
        ogSiteName = content;
        break;
    }
    switch (name) {
      case "twitter:title":
        twitterTitle = content;
        break;
      case "twitter:description":
        twitterDescription = content;
        break;
      case "twitter:image":
        twitterImage = content;
        break;
      case "description":
        plainDescription = content;
        break;
    }
  }

  const titleMatch = TITLE_TAG_RE.exec(head);
  const documentTitle = titleMatch?.[1] ?? null;

  return {
    title: cleanText(ogTitle ?? twitterTitle ?? documentTitle),
    description: cleanText(ogDescription ?? twitterDescription ?? plainDescription),
    imageUrl: cleanUrl(ogImage ?? twitterImage),
    siteName: cleanText(ogSiteName),
  };
}
