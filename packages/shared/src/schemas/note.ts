import { z } from "zod";
import { EncryptedPayloadSchema } from "./common.js";
import type { SenderType } from "../enums.js";

export const SaveConversationNoteRequestSchema = z.object({ content: EncryptedPayloadSchema });
export type SaveConversationNoteRequestInput = z.infer<typeof SaveConversationNoteRequestSchema>;

export const NoteAssetMetaRequestSchema = z.object({ meta: EncryptedPayloadSchema });

export interface ConversationNoteDto {
  id: string;
  conversationId: string;
  content: z.infer<typeof EncryptedPayloadSchema>;
  updatedBy: SenderType;
  updatedAt: string;
}

export interface NoteAssetDto {
  id: string;
  conversationId: string;
  meta: z.infer<typeof EncryptedPayloadSchema>;
  sizeBytes: number;
  createdAt: string;
}
