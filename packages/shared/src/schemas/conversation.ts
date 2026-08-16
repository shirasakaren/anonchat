import { z } from "zod";
import { CuidSchema, EncryptedPayloadSchema, PaginationQuerySchema } from "./common.js";
import type { SenderType } from "../enums.js";

export const SendMessageRequestSchema = z.object({
  content: EncryptedPayloadSchema,
  replyToId: CuidSchema.nullish(),
  attachmentIds: z.array(CuidSchema).max(10).optional(),
  /// Client-generated id for the sender's optimistic bubble. Echoed back
  /// on the REST response and the WebSocket broadcast so the optimistic
  /// copy can be replaced in place instead of briefly rendering twice.
  clientId: z.string().min(1).max(64).optional(),
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

export const MessagesQuerySchema = PaginationQuerySchema.extend({
  /// Default "asc" (oldest first, cursor walks forward). "desc" returns the
  /// newest page first - used by the inbox's last-message preview so it
  /// never reads the tail of the oldest page of a long conversation.
  direction: z.enum(["asc", "desc"]).optional(),
});

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
  clientId: string | null;
}

export interface ConversationDto {
  id: string;
  publicId: string;
  /** Optional name chosen by the visitor. This is distinct from the admin's private alias. */
  anonymousDisplayName: string | null;
  status: "ACTIVE" | "ARCHIVED" | "BLOCKED";
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
  /** The anonymous participant's X25519 public key - needed by the admin's client to derive the shared conversation key via ECDH. */
  anonymousExchangePublicKey: string;
}

/** Admin-only view of a conversation. `adminAlias`/`mutedAt` are deliberately
 *  NOT part of the user-facing ConversationDto above: they're the admin's
 *  private metadata for this contact and must never reach the anonymous
 *  user's client, including inside WebSocket payloads. */
export interface AdminConversationDto extends ConversationDto {
  adminAlias: string | null;
  mutedAt: string | null;
  /** Whether the anonymous user currently has a live WebSocket connected. */
  userOnline: boolean;
}

export interface MessagePage {
  messages: MessageDto[];
  nextCursor: string | null;
}
