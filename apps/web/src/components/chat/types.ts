import type { AttachmentDto, ReactionDto, SenderType } from "@anonchat/shared";

export interface DisplayMessage {
  id: string;
  senderType: SenderType;
  text: string;
  replyToId: string | null;
  attachments: AttachmentDto[];
  reactions: ReactionDto[];
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  readAt: string | null;
  status: "sent" | "sending" | "failed";
  failureReason?: string;
}
