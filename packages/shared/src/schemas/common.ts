import { z } from "zod";
import { MAX_CIPHERTEXT_ENVELOPE_BYTES } from "../constants.js";

const base64url = /^[A-Za-z0-9_-]+$/;

/**
 * `.max()` chained onto an existing Zod string schema ADDS a check rather
 * than replacing the prior one - `Base64UrlSchema.max(600_000)` would still
 * enforce the original max(4096) too, since both checks run and the
 * smaller one binds. A factory avoids that trap for any field whose real
 * max differs from the 4096 default (this bit the ciphertext field below:
 * raising MAX_CIPHERTEXT_ENVELOPE_BYTES alone silently did nothing, because
 * the schema was still capped at 4096 characters underneath it).
 */
function base64UrlString(maxLength: number) {
  return z.string().min(1).max(maxLength).regex(base64url, "must be base64url");
}

/** Default max is fine for short fields (keys, signatures, nonces) - callers
 *  needing a genuinely different limit should use base64UrlString(n)
 *  directly instead of chaining .max() on this. */
export const Base64UrlSchema = base64UrlString(4096);

/**
 * Wire format for any end-to-end encrypted field. The server stores and
 * relays this opaque blob; it never sees plaintext.
 */
export const EncryptedPayloadSchema = z.object({
  nonce: Base64UrlSchema.max(64),
  ciphertext: base64UrlString(MAX_CIPHERTEXT_ENVELOPE_BYTES),
});
export type EncryptedPayloadInput = z.infer<typeof EncryptedPayloadSchema>;

export const PublicKeysSchema = z.object({
  signingPublicKey: Base64UrlSchema.max(64),
  exchangePublicKey: Base64UrlSchema.max(64),
});
export type PublicKeysInput = z.infer<typeof PublicKeysSchema>;

export const PublicIdSchema = z
  .string()
  .regex(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, "must look like ABCD-1234-EF56");

export const CuidSchema = z.string().min(1).max(64);

export const IdParamSchema = z.object({ id: CuidSchema });
export const ConversationMessageParamsSchema = z.object({ id: CuidSchema, messageId: CuidSchema });
export const ConversationAttachmentParamsSchema = z.object({ id: CuidSchema, attachmentId: CuidSchema });

export const PaginationQuerySchema = z.object({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type PaginationQueryInput = z.infer<typeof PaginationQuerySchema>;
