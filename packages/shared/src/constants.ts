/**
 * Because message content is end-to-end encrypted, the server can never
 * validate plaintext length (MAX_MESSAGE_LENGTH is enforced client-side,
 * before encryption). What the server CAN and does enforce is a hard
 * ceiling on the encrypted envelope size, as a DoS/storage guard - this is
 * intentionally generous to comfortably fit MAX_MESSAGE_LENGTH plaintext
 * plus JSON envelope, nonce, and base64 overhead.
 *
 * Sized for DEFAULT_MAX_MESSAGE_LENGTH (100,000 chars): worst case is
 * 100,000 chars x 4 bytes (UTF-8) = ~400,000 bytes of plaintext, plus the
 * small JSON envelope (`{"text":"..."}`) and AEAD tag, then base64url
 * inflates that by ~4/3 -> ~535,000 characters. 600,000 leaves headroom.
 * `fieldSize` in apps/server/src/app.ts's multipart config must stay >=
 * this (it bounds the same field when a message ships with attachments).
 */
export const MAX_CIPHERTEXT_ENVELOPE_BYTES = 600_000;

export const DEFAULT_MAX_MESSAGE_LENGTH = 100_000;
export const DEFAULT_MAX_ATTACHMENT_SIZE_MB = 25;
export const DEFAULT_MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES = 15;

export const DEFAULT_RATE_LIMIT_MESSAGES_PER_MINUTE = 20;
export const DEFAULT_RATE_LIMIT_REGISTRATIONS_PER_HOUR = 10;
export const DEFAULT_RATE_LIMIT_LINK_PREVIEWS_PER_MINUTE = 20;

/**
 * Rendering a rich preview for a shared link means the server fetches that
 * URL's metadata on the caller's behalf - the one place in this app where
 * the server makes an outbound request to a destination the client
 * controls, and therefore a small, deliberate exception to "the server
 * never learns what's inside a conversation" (see docs/ARCHITECTURE.md).
 * It learns *that a URL was shared*, not the message it was shared in.
 * Hard-capped and SSRF-guarded server-side (apps/server/src/security/ssrfGuard.ts)
 * regardless of this value; this env var is only the operator's on/off switch.
 */
export const MAX_LINK_PREVIEW_RESPONSE_BYTES = 512_000;
// 800 KB: sized against real-world OG images, not a round guess - GitHub's
// own homepage og:image alone is ~620 KB, and a lower cap silently dropped
// it (never truncated - see fetchLinkPreview.ts's readCapped "discard"
// mode, which refuses to serve a corrupted partial image).
export const MAX_LINK_PREVIEW_IMAGE_BYTES = 800_000;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const CHALLENGE_TTL_SECONDS = 120;

export const ANON_SESSION_COOKIE = "anonchat_session";
export const ADMIN_SESSION_COOKIE = "anonchat_admin_session";
export const CSRF_COOKIE = "anonchat_csrf";
export const CSRF_HEADER = "x-anonchat-csrf";

export const RECOVERY_ACK_TEXT = "I have saved my recovery key";
