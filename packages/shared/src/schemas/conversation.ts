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

/** WhatsApp-style disappearing-message timelines, in seconds. */
export const DISAPPEARING_OPTIONS_SECONDS = [86_400, 604_800, 7_776_000] as const;
export type DisappearingSeconds = (typeof DISAPPEARING_OPTIONS_SECONDS)[number];

/** Per-conversation message retention, configurable by either participant.
 *  Both fields are plain metadata (not content), so the server can apply
 *  them without breaking the E2EE property. */
export const RetentionRequestSchema = z.object({
  disappearingEnabled: z.boolean().optional(),
  disappearingSeconds: z
    .union([z.literal(null), z.coerce.number().refine((n) => DISAPPEARING_OPTIONS_SECONDS.includes(n as DisappearingSeconds))])
    .optional(),
  disappearingOnLogout: z.boolean().optional(),
  autoDeleteMode: z.enum(["OFF", "DISCONNECT", "BOTH_READ", "AFTER_DAYS"]).optional(),
  autoDeleteDays: z.union([z.literal(null), z.coerce.number().int().min(1).max(365)]).optional(),
});
export type RetentionRequestInput = z.infer<typeof RetentionRequestSchema>;

export interface ConversationRetentionDto {
  disappearing: {
    enabled: boolean;
    seconds: number | null;
    onLogout: boolean;
  };
  autoDelete: {
    mode: "OFF" | "DISCONNECT" | "BOTH_READ" | "AFTER_DAYS";
    days: number | null;
  };
}

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
  /** Disappearing messages and auto-delete settings - visible to both
   *  participants, since either side can change them. */
  retention: ConversationRetentionDto;
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
  /** Whether this visitor has an active (consented) diagnostics row. The
   *  admin chat only shows the insights entry point when this is true -
   *  visitors who never opted in shouldn't see a dead icon pointing at
   *  nothing. */
  visitorInsightsActive: boolean;
}

export interface MessagePage {
  messages: MessageDto[];
  nextCursor: string | null;
}
