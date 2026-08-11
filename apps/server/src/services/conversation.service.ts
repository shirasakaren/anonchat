import type { Conversation, ConversationStatus, Prisma, SenderType } from "@prisma/client";
import { bytesToBase64url } from "@termine/crypto";
import type { AdminConversationSummaryDto, ConversationDto, MessagePage } from "@termine/shared";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@termine/shared";
import { prisma } from "../db.js";
import { publishToConversation } from "../realtime/hub.js";
import { getStorageAdapter } from "../storage/index.js";
import { Errors } from "../utils/errors.js";
import { MESSAGE_INCLUDE, toMessageDto } from "../utils/dto.js";

const ANONYMOUS_USER_SELECT = { publicId: true, exchangePublicKey: true } as const;

function otherSender(viewer: SenderType): SenderType {
  return viewer === "ADMIN" ? "USER" : "ADMIN";
}

export async function countUnread(conversationId: string, forViewer: SenderType): Promise<number> {
  return prisma.message.count({
    where: { conversationId, senderType: otherSender(forViewer), readAt: null, deletedAt: null },
  });
}

export function toConversationDto(
  conversation: Conversation,
  anonymousUser: { publicId: string; exchangePublicKey: Uint8Array },
  unreadCount: number,
): ConversationDto {
  return {
    id: conversation.id,
    publicId: anonymousUser.publicId,
    status: conversation.status,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toISOString() : null,
    unreadCount,
    anonymousExchangePublicKey: bytesToBase64url(anonymousUser.exchangePublicKey),
  };
}

export async function getMessagesPage(
  conversationId: string,
  options: { cursor?: string; limit?: number },
): Promise<MessagePage> {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: MESSAGE_INCLUDE,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: page.map(toMessageDto),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function markRead(
  conversationId: string,
  forViewer: SenderType,
  upToMessageId: string,
): Promise<{ upToMessageId: string; readAt: string } | null> {
  const target = await prisma.message.findFirst({
    where: { id: upToMessageId, conversationId, senderType: otherSender(forViewer) },
  });
  if (!target) return null;
  const readAt = new Date();
  await prisma.message.updateMany({
    where: {
      conversationId,
      senderType: otherSender(forViewer),
      readAt: null,
      createdAt: { lte: target.createdAt },
    },
    data: { readAt },
  });

  publishToConversation(conversationId, {
    type: "conversation.read",
    conversationId,
    // The sender whose messages just became read (i.e. the other party
    // relative to whoever called markRead), so the original sender's UI can
    // flip a read receipt on their own messages.
    senderType: otherSender(forViewer),
    upToMessageId,
    readAt: readAt.toISOString(),
  });

  return { upToMessageId, readAt: readAt.toISOString() };
}

export async function listConversationsForAdmin(query: {
  status?: "ACTIVE" | "ARCHIVED" | "BLOCKED" | "ALL" | "UNREAD" | "READ";
  q?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ conversations: AdminConversationSummaryDto[]; nextCursor: string | null }> {
  const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const where: Prisma.ConversationWhereInput = { deletedAt: null };

  if (query.status === "UNREAD") {
    where.messages = { some: { senderType: "USER", readAt: null, deletedAt: null } };
  } else if (query.status === "READ") {
    where.messages = { none: { senderType: "USER", readAt: null, deletedAt: null } };
  } else if (query.status && query.status !== "ALL") {
    where.status = query.status as ConversationStatus;
  }

  if (query.q) {
    where.anonymousUser = { publicId: { contains: query.q, mode: "insensitive" } };
  }

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const unreadCounts = await Promise.all(page.map((c) => countUnread(c.id, "ADMIN")));

  return {
    conversations: page.map((c, i) => ({
      id: c.id,
      publicId: c.anonymousUser.publicId,
      status: c.status,
      unreadCount: unreadCounts[i]!,
      createdAt: c.createdAt.toISOString(),
      lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      anonymousExchangePublicKey: bytesToBase64url(c.anonymousUser.exchangePublicKey),
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function getConversationForAdmin(conversationId: string): Promise<ConversationDto> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, deletedAt: null },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  if (!conversation) throw Errors.notFound();
  const unreadCount = await countUnread(conversation.id, "ADMIN");
  return toConversationDto(conversation, conversation.anonymousUser, unreadCount);
}

export async function setConversationStatus(conversationId: string, status: ConversationStatus): Promise<ConversationDto> {
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  const unreadCount = await countUnread(conversationId, "ADMIN");
  const dto = toConversationDto(conversation, conversation.anonymousUser, unreadCount);
  publishToConversation(conversationId, { type: "conversation.updated", conversation: dto });
  return dto;
}

export async function softDeleteConversation(conversationId: string): Promise<void> {
  await prisma.conversation.update({ where: { id: conversationId }, data: { deletedAt: new Date() } });
}

export async function restoreConversation(conversationId: string): Promise<ConversationDto> {
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { deletedAt: null },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  const unreadCount = await countUnread(conversationId, "ADMIN");
  return toConversationDto(conversation, conversation.anonymousUser, unreadCount);
}

export async function hardDeleteConversation(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { include: { attachments: true } } },
  });
  if (!conversation) throw Errors.notFound();

  const storage = getStorageAdapter();
  await Promise.allSettled(
    conversation.messages.flatMap((message) => message.attachments).map((attachment) => storage.delete(attachment.storageKey)),
  );

  await prisma.$transaction([
    prisma.conversation.delete({ where: { id: conversationId } }),
    prisma.anonymousUser.update({ where: { id: conversation.anonymousUserId }, data: { status: "DELETED" } }),
  ]);
}
