import type { AttachmentDto, ReactionDto, SenderType } from "@anonchat/shared";

export interface PendingAttachmentPreview {
  filename: string;
  mimetype: string;
  size: number;
  previewUrl: string | null;
}

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
  pendingAttachments?: PendingAttachmentPreview[];
  transferProgress?: number;
  failureReason?: string;
  decryptionError?: string;
}
