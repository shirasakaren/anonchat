import type { Attachment, Message, MessageReaction } from "@prisma/client";
import { bytesToBase64url } from "@termine/crypto";
import type { AttachmentDto, EncryptedPayloadInput, MessageDto, ReactionDto } from "@termine/shared";

export function encryptedPayloadFromColumns(
  ciphertext: Buffer | Uint8Array | null,
  nonce: Buffer | Uint8Array | null,
): EncryptedPayloadInput | null {
  if (!ciphertext || !nonce) return null;
  return { ciphertext: bytesToBase64url(ciphertext), nonce: bytesToBase64url(nonce) };
}

export function toAttachmentDto(attachment: Attachment): AttachmentDto {
  return {
    id: attachment.id,
    meta: {
      ciphertext: bytesToBase64url(attachment.metaCiphertext),
      nonce: bytesToBase64url(attachment.metaNonce),
    },
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
  };
}

export function toReactionDto(reaction: MessageReaction): ReactionDto {
  return {
    senderType: reaction.senderType,
    emoji: {
      ciphertext: bytesToBase64url(reaction.emojiCiphertext),
      nonce: bytesToBase64url(reaction.emojiNonce),
    },
    createdAt: reaction.createdAt.toISOString(),
  };
}

type MessageWithRelations = Message & { attachments: Attachment[]; reactions: MessageReaction[] };

export function toMessageDto(message: MessageWithRelations): MessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderType: message.senderType,
    content: message.deletedAt ? null : encryptedPayloadFromColumns(message.contentCiphertext, message.contentNonce),
    replyToId: message.replyToId,
    attachments: message.attachments.map(toAttachmentDto),
    reactions: message.reactions.map(toReactionDto),
    edited: message.edited,
    deleted: Boolean(message.deletedAt),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    readAt: message.readAt ? message.readAt.toISOString() : null,
  };
}

export const MESSAGE_INCLUDE = { attachments: true, reactions: true } as const;
