import { z } from "zod";
import { MAX_CIPHERTEXT_ENVELOPE_BYTES } from "../constants.js";

const base64url = /^[A-Za-z0-9_-]+$/;

export const Base64UrlSchema = z.string().min(1).max(4096).regex(base64url, "must be base64url");

/**
 * Wire format for any end-to-end encrypted field. The server stores and
 * relays this opaque blob; it never sees plaintext.
 */
export const EncryptedPayloadSchema = z.object({
  nonce: Base64UrlSchema.max(64),
  ciphertext: Base64UrlSchema.max(MAX_CIPHERTEXT_ENVELOPE_BYTES),
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
