import { z } from "zod";
import type { ConversationDto, MessageDto, ReactionDto } from "./schemas/conversation.js";
import type { ConversationNoteDto } from "./schemas/note.js";
import type { SenderType } from "./enums.js";

// ---- Client -> Server -------------------------------------------------

export const ClientWsMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("typing.start"), conversationId: z.string().max(64).optional() }),
  z.object({ type: z.literal("typing.stop"), conversationId: z.string().max(64).optional() }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientWsMessage = z.infer<typeof ClientWsMessageSchema>;

// ---- Server -> Client ---------------------------------------------------

export type ServerWsEvent =
  | { type: "connected" }
  | { type: "message.created"; conversationId: string; message: MessageDto }
  | { type: "message.updated"; conversationId: string; message: MessageDto }
  | { type: "message.deleted"; conversationId: string; messageId: string }
  | { type: "reaction.updated"; conversationId: string; messageId: string; reactions: ReactionDto[] }
  | { type: "note.updated"; conversationId: string; note: ConversationNoteDto }
  | { type: "conversation.updated"; conversation: ConversationDto }
  | {
      type: "conversation.read";
      conversationId: string;
      senderType: SenderType;
      upToMessageId: string;
      readAt: string;
    }
  | { type: "typing"; conversationId: string; from: SenderType; isTyping: boolean }
  | { type: "presence"; who: "ADMIN"; online: boolean }
  /** Admin-only: the anonymous user's live-socket state for one conversation. */
  | { type: "user.presence"; conversationId: string; online: boolean }
  /** Broadcast to every connected socket (anonymous and admin) when the admin changes the site-wide theme. */
  | { type: "site.updated"; theme: string }
  | { type: "error"; message: string; code?: string };
