import { z } from "zod";
import { CuidSchema, EncryptedPayloadSchema, PaginationQuerySchema } from "./common.js";
import type { SenderType } from "../enums.js";

export const SendMessageRequestSchema = z.object({
  content: EncryptedPayloadSchema,
  replyToId: CuidSchema.nullish(),
  attachmentIds: z.array(CuidSchema).max(10).optional(),
});
export type SendMessageRequestInput = z.infer<typeof SendMessageRequestSchema>;

export const EditMessageRequestSchema = z.object({
  content: EncryptedPayloadSchema,
});
export type EditMessageRequestInput = z.infer<typeof EditMessageRequestSchema>;

export const ReactionRequestSchema = z.object({
  emoji: EncryptedPayloadSchema,
});
export type ReactionRequestInput = z.infer<typeof ReactionRequestSchema>;

export const ReadReceiptRequestSchema = z.object({
  upToMessageId: CuidSchema,
});
export type ReadReceiptRequestInput = z.infer<typeof ReadReceiptRequestSchema>;

export const MessagesQuerySchema = PaginationQuerySchema;

export interface AttachmentDto {
  id: string;
  meta: z.infer<typeof EncryptedPayloadSchema>;
  sizeBytes: number;
  createdAt: string;
}

export interface ReactionDto {
  senderType: SenderType;
  emoji: z.infer<typeof EncryptedPayloadSchema>;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderType: SenderType;
  content: z.infer<typeof EncryptedPayloadSchema> | null;
  replyToId: string | null;
  attachments: AttachmentDto[];
  reactions: ReactionDto[];
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
}

export interface ConversationDto {
  id: string;
  publicId: string;
  status: "ACTIVE" | "ARCHIVED" | "BLOCKED";
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
  /** The anonymous participant's X25519 public key - needed by the admin's client to derive the shared conversation key via ECDH. */
  anonymousExchangePublicKey: string;
}

/** Admin-only view of a conversation. `adminAlias` is deliberately NOT part
 *  of the user-facing ConversationDto above: it's the admin's private
 *  nickname for this contact and must never reach the anonymous user's
 *  client, including inside WebSocket payloads. */
export interface AdminConversationDto extends ConversationDto {
  adminAlias: string | null;
}

export interface MessagePage {
  messages: MessageDto[];
  nextCursor: string | null;
}
