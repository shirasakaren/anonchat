import type { SenderType } from "@prisma/client";
import type { EncryptedPayloadInput } from "@anonchat/shared";
import { prisma } from "../db.js";
import { publishToConversation } from "../realtime/hub.js";
import { getStorageAdapter } from "../storage/index.js";
import { Errors } from "../utils/errors.js";
import { evictCachedBlob } from "../utils/blobCache.js";
import { MESSAGE_INCLUDE, toMessageDto, toReactionDto } from "../utils/dto.js";
import { maybeSendAdminPush, maybeSendUserPush } from "./pushNotification.service.js";
import { maybeSendReplyNotification } from "./replyNotification.service.js";

export interface PendingAttachment {
  meta: EncryptedPayloadInput;
  /** Already written to storage by parseSendMessageBody (the multipart
   *  parser must drain each file part before reading the next one). */
  storageKey: string;
  sizeBytes: number;
}

function toBuffer(payload: EncryptedPayloadInput) {
  return { ciphertext: Buffer.from(payload.ciphertext, "base64url"), nonce: Buffer.from(payload.nonce, "base64url") };
}

/**
 * Blocking/soft-deleting a conversation only has teeth if every write path
 * checks it, not just "send" - a blocked user must not be able to edit,
 * delete, or react their way around a block.
 */
async function assertUserCanMutate(conversationId: string, senderType: SenderType): Promise<void> {
  if (senderType !== "USER") return;
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.status === "BLOCKED" || conversation.deletedAt) {
    throw Errors.blocked();
  }
}

export async function createMessage(params: {
  conversationId: string;
  senderType: SenderType;
  content: EncryptedPayloadInput;
  replyToId?: string | null;
  clientId?: string | null;
  attachments?: PendingAttachment[];
}) {
  const conversation = await prisma.conversation.findUnique({ where: { id: params.conversationId } });
  if (!conversation) throw Errors.notFound();
  if (params.senderType === "USER" && (conversation.status === "BLOCKED" || conversation.deletedAt)) {
    throw Errors.blocked();
  }

  if (params.replyToId) {
    const target = await prisma.message.findFirst({
      where: { id: params.replyToId, conversationId: params.conversationId },
    });
    if (!target) throw Errors.badRequest("The message you're replying to doesn't exist in this conversation.");
  }

  const content = toBuffer(params.content);
  const storage = getStorageAdapter();
  const attachmentInputs = params.attachments ?? [];
  const storageKeys = attachmentInputs.map((attachment) => attachment.storageKey);

  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: params.conversationId,
          senderType: params.senderType,
          contentCiphertext: content.ciphertext,
          contentNonce: content.nonce,
          replyToId: params.replyToId ?? null,
          clientId: params.clientId ?? null,
          // Disappearing messages: only messages sent AFTER the setting was
          // enabled carry an expiry - never retroactively applied to older
          // history.
          ...(conversation.disappearingEnabled && conversation.disappearingSeconds
            ? { expiresAt: new Date(Date.now() + conversation.disappearingSeconds * 1000) }
            : {}),
          attachments: {
            create: attachmentInputs.map((attachment) => {
              const metaBuf = toBuffer(attachment.meta);
              return {
                storageKey: attachment.storageKey,
                metaCiphertext: metaBuf.ciphertext,
                metaNonce: metaBuf.nonce,
                sizeBytes: attachment.sizeBytes,
              };
            }),
          },
        },
        include: MESSAGE_INCLUDE,
      });

      await tx.conversation.update({
        where: { id: params.conversationId },
        data: {
          lastMessageAt: created.createdAt,
          ...(params.senderType === "USER" && conversation.status === "ARCHIVED" ? { status: "ACTIVE" } : {}),
        },
      });

      return created;
    });

    const dto = toMessageDto(message);
    publishToConversation(params.conversationId, {
      type: "message.created",
      conversationId: params.conversationId,
      message: dto,
    });
    // Fire-and-forget: neither an SMTP/Resend round trip nor a Web Push
    // send should add latency to the message-send response, and both
    // sendEmail and the push module already swallow/log their own failures.
    if (params.senderType === "ADMIN") {
      void maybeSendReplyNotification(params.conversationId);
      void maybeSendUserPush(conversation);
    } else {
      void maybeSendAdminPush(conversation);
    }
    return dto;
  } catch (error) {
    await Promise.allSettled(storageKeys.map((key) => storage.delete(key)));
    throw error;
  }
}

export async function editMessage(params: {
  conversationId: string;
  messageId: string;
  senderType: SenderType;
  content: EncryptedPayloadInput;
  editWindowMinutes: number;
}) {
  await assertUserCanMutate(params.conversationId, params.senderType);
  const message = await prisma.message.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId, senderType: params.senderType },
  });
  if (!message || message.deletedAt) throw Errors.notFound();
  const ageMs = Date.now() - message.createdAt.getTime();
  if (ageMs > params.editWindowMinutes * 60_000) {
    throw Errors.badRequest(`You can only edit a message within ${params.editWindowMinutes} minutes of sending it.`);
  }
  const content = toBuffer(params.content);
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { contentCiphertext: content.ciphertext, contentNonce: content.nonce, edited: true },
    include: MESSAGE_INCLUDE,
  });
  const dto = toMessageDto(updated);
  publishToConversation(params.conversationId, {
    type: "message.updated",
    conversationId: params.conversationId,
    message: dto,
  });
  return dto;
}

export async function deleteMessage(params: { conversationId: string; messageId: string; senderType: SenderType }) {
  await assertUserCanMutate(params.conversationId, params.senderType);
  const message = await prisma.message.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId, senderType: params.senderType },
    include: { attachments: true },
  });
  if (!message || message.deletedAt) throw Errors.notFound();

  const storage = getStorageAdapter();
  await Promise.allSettled(
    message.attachments.map((attachment) => {
      evictCachedBlob(attachment.storageKey);
      return storage.delete(attachment.storageKey);
    }),
  );

  await prisma.$transaction([
    prisma.attachment.deleteMany({ where: { messageId: message.id } }),
    prisma.message.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), contentCiphertext: null, contentNonce: null },
    }),
  ]);

  publishToConversation(params.conversationId, {
    type: "message.deleted",
    conversationId: params.conversationId,
    messageId: message.id,
  });
}

export async function setReaction(params: {
  conversationId: string;
  messageId: string;
  senderType: SenderType;
  emoji: EncryptedPayloadInput | null;
}) {
  await assertUserCanMutate(params.conversationId, params.senderType);
  const message = await prisma.message.findFirst({
    where: { id: params.messageId, conversationId: params.conversationId },
  });
  if (!message || message.deletedAt) throw Errors.notFound();

  if (params.emoji === null) {
    await prisma.messageReaction.deleteMany({ where: { messageId: message.id, senderType: params.senderType } });
  } else {
    const emoji = toBuffer(params.emoji);
    await prisma.messageReaction.upsert({
      where: { messageId_senderType: { messageId: message.id, senderType: params.senderType } },
      create: {
        messageId: message.id,
        senderType: params.senderType,
        emojiCiphertext: emoji.ciphertext,
        emojiNonce: emoji.nonce,
      },
      update: { emojiCiphertext: emoji.ciphertext, emojiNonce: emoji.nonce },
    });
  }

  const reactions = await prisma.messageReaction.findMany({ where: { messageId: message.id } });
  publishToConversation(params.conversationId, {
    type: "reaction.updated",
    conversationId: params.conversationId,
    messageId: message.id,
    reactions: reactions.map(toReactionDto),
  });
}
