export const RECOVERY_SECRET_BYTES = 32;
/**
 * 6 bytes (48 bits) keeps 50%-collision odds out past ~16 million anonymous
 * users (birthday bound), while staying short enough to display.
 */
export const PUBLIC_ID_BYTES = 6;
export const SYMMETRIC_KEY_BYTES = 32;
export const XCHACHA_NONCE_BYTES = 24;
export const CHALLENGE_BYTES = 32;

export const IDENTITY_HKDF_SALT = "anonchat-identity-v1";
export const CONVERSATION_HKDF_INFO_PREFIX = "anonchat-conversation-v1:";
