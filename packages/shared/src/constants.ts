/**
 * Because message content is end-to-end encrypted, the server can never
 * validate plaintext length (MAX_MESSAGE_LENGTH is enforced client-side,
 * before encryption). What the server CAN and does enforce is a hard
 * ceiling on the encrypted envelope size, as a DoS/storage guard - this is
 * intentionally generous to comfortably fit MAX_MESSAGE_LENGTH plaintext
 * plus JSON envelope, nonce, and base64 overhead.
 */
export const MAX_CIPHERTEXT_ENVELOPE_BYTES = 131_072; // 128 KiB

export const DEFAULT_MAX_MESSAGE_LENGTH = 8000;
export const DEFAULT_MAX_ATTACHMENT_SIZE_MB = 25;
export const DEFAULT_MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const DEFAULT_MESSAGE_EDIT_WINDOW_MINUTES = 15;

export const DEFAULT_RATE_LIMIT_MESSAGES_PER_MINUTE = 20;
export const DEFAULT_RATE_LIMIT_REGISTRATIONS_PER_HOUR = 10;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const CHALLENGE_TTL_SECONDS = 120;

export const ANON_SESSION_COOKIE = "anonchat_session";
export const ADMIN_SESSION_COOKIE = "anonchat_admin_session";
export const CSRF_COOKIE = "anonchat_csrf";
export const CSRF_HEADER = "x-anonchat-csrf";

export const RECOVERY_ACK_TEXT = "I have saved my recovery key";
