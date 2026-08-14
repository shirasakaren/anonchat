import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { fetch } from "undici";
import { readCapped } from "./linkPreview/readCapped.js";

const FETCH_TIMEOUT_MS = 5_000;
const USER_AGENT = "AnonchatGravatarImport/1.0 (+admin-initiated avatar picture import)";

export const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const MAX_AVATAR_BYTES = 2_000_000;

/** Gravatar's current API expects the SHA256 of the trimmed, lowercased
 *  email (the older MD5 form still works but SHA256 is what Gravatar's own
 *  docs recommend today). */
function gravatarHash(email: string): string {
  const normalized = email.trim().toLowerCase();
  return bytesToHex(sha256(new TextEncoder().encode(normalized)));
}

/**
 * Fetches only the profile *picture* for a Gravatar email, server-side -
 * never hot-linked from the client, since an <img src> pointed straight at
 * gravatar.com would leak every visitor's IP to Automattic on each page
 * load (this fetch is admin-initiated and one-shot, not per-visitor). The
 * destination host is fixed (always gravatar.com, never admin-controlled),
 * so this doesn't need the full SSRF guard the arbitrary-URL link-preview
 * fetcher does - there's no caller-controlled host or redirect target to
 * validate.
 *
 * `d=404` makes Gravatar return a plain 404 instead of a generic silhouette
 * when the email has no Gravatar image, so that case can be reported
 * clearly instead of "successfully" importing a meaningless default.
 *
 * Returns null if there's no Gravatar for this email, the fetch failed, or
 * the response wasn't a supported image type/size - never throws.
 */
export async function fetchGravatarAvatarDataUrl(email: string): Promise<string | null> {
  const url = new URL(`https://www.gravatar.com/avatar/${gravatarHash(email)}`);
  url.searchParams.set("s", "480");
  url.searchParams.set("d", "404");

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "image/*" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
  if (!ALLOWED_AVATAR_MIME_TYPES.has(contentType)) return null;

  const bytes = await readCapped(response.body?.getReader(), MAX_AVATAR_BYTES, "discard");
  if (!bytes) return null;

  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}
