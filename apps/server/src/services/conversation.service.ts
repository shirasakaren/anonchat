import type { Conversation, ConversationStatus, Prisma, SenderType } from "@prisma/client";
import { bytesToBase64url } from "@anonchat/crypto";
import type { AdminConversationDto, AdminConversationSummaryDto, ConversationDto, MessagePage } from "@anonchat/shared";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@anonchat/shared";
import { prisma } from "../db.js";
import { isUserOnline, publishToConversation } from "../realtime/hub.js";
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

/** Admin-only variant: adds the admin's private metadata. Deliberately kept
 *  out of toConversationDto (and therefore out of every user-facing REST
 *  response and WebSocket payload) so none of it can ever reach the
 *  anonymous user's client. */
export function toAdminConversationDto(
  conversation: Conversation,
  anonymousUser: { publicId: string; exchangePublicKey: Uint8Array },
  unreadCount: number,
): AdminConversationDto {
  return {
    ...toConversationDto(conversation, anonymousUser, unreadCount),
    adminAlias: conversation.adminAlias,
    mutedAt: conversation.mutedAt ? conversation.mutedAt.toISOString() : null,
    userOnline: isUserOnline(conversation.id),
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
  }

  // Archived conversations are their own view: every filter EXCEPT the
  // explicit ARCHIVED (and BLOCKED, which is its own list) hides them,
  // the way WhatsApp hides archived chats from the main list.
  if (query.status === "BLOCKED") {
    where.status = "BLOCKED";
  } else {
    where.status = query.status === "ARCHIVED" ? "ARCHIVED" : { not: "ARCHIVED" };
  }

  if (query.q) {
    // Search matches either the anonymous publicId or the admin's private
    // alias - the alias exists so the admin can find contacts by name.
    where.OR = [
      { anonymousUser: { publicId: { contains: query.q, mode: "insensitive" } } },
      { adminAlias: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.conversation.findMany({
    where,
    // nulls: "last" is essential here: Postgres sorts NULLs FIRST for DESC,
    // so without it every conversation that has no messages yet (a visitor
    // who created an identity but never sent anything) crowds the top of
    // the inbox ahead of every real conversation.
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
      adminAlias: c.adminAlias,
      mutedAt: c.mutedAt ? c.mutedAt.toISOString() : null,
      status: c.status,
      unreadCount: unreadCounts[i]!,
      createdAt: c.createdAt.toISOString(),
      lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      anonymousExchangePublicKey: bytesToBase64url(c.anonymousUser.exchangePublicKey),
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export async function getConversationForAdmin(conversationId: string): Promise<AdminConversationDto> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, deletedAt: null },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  if (!conversation) throw Errors.notFound();
  const unreadCount = await countUnread(conversation.id, "ADMIN");
  return toAdminConversationDto(conversation, conversation.anonymousUser, unreadCount);
}

export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus,
): Promise<AdminConversationDto> {
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { status },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  const unreadCount = await countUnread(conversationId, "ADMIN");
  // The broadcast DTO stays user-safe (no adminAlias) - it reaches the
  // anonymous user's socket too. The admin response carries the alias.
  const userSafeDto = toConversationDto(conversation, conversation.anonymousUser, unreadCount);
  publishToConversation(conversationId, { type: "conversation.updated", conversation: userSafeDto });
  return toAdminConversationDto(conversation, conversation.anonymousUser, unreadCount);
}

export async function softDeleteConversation(conversationId: string): Promise<void> {
  await prisma.conversation.update({ where: { id: conversationId }, data: { deletedAt: new Date() } });
}

export async function restoreConversation(conversationId: string): Promise<AdminConversationDto> {
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { deletedAt: null },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  const unreadCount = await countUnread(conversationId, "ADMIN");
  return toAdminConversationDto(conversation, conversation.anonymousUser, unreadCount);
}

/** Sets (or clears, with null/empty) the admin's private nickname for this
 *  conversation. Returns the admin DTO to the caller, but only the
 *  user-safe DTO is broadcast. */
export async function setConversationAlias(
  conversationId: string,
  alias: string | null,
): Promise<AdminConversationDto> {
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { adminAlias: alias && alias.trim().length > 0 ? alias.trim() : null },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  const unreadCount = await countUnread(conversationId, "ADMIN");
  const userSafeDto = toConversationDto(conversation, conversation.anonymousUser, unreadCount);
  publishToConversation(conversationId, { type: "conversation.updated", conversation: userSafeDto });
  return toAdminConversationDto(conversation, conversation.anonymousUser, unreadCount);
}

/** Mutes or unmutes a conversation for the admin: while muted, new user
 *  messages don't fire the admin's notification sound/popup. Same
 *  admin-only/private-metadata rules as the alias. */
export async function setConversationMuted(conversationId: string, muted: boolean): Promise<AdminConversationDto> {
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { mutedAt: muted ? new Date() : null },
    include: { anonymousUser: { select: ANONYMOUS_USER_SELECT } },
  });
  const unreadCount = await countUnread(conversationId, "ADMIN");
  const userSafeDto = toConversationDto(conversation, conversation.anonymousUser, unreadCount);
  publishToConversation(conversationId, { type: "conversation.updated", conversation: userSafeDto });
  return toAdminConversationDto(conversation, conversation.anonymousUser, unreadCount);
}

export async function hardDeleteConversation(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { include: { attachments: true } } },
  });
  if (!conversation) throw Errors.notFound();

  const storage = getStorageAdapter();
  await Promise.allSettled(
    conversation.messages
      .flatMap((message) => message.attachments)
      .map((attachment) => storage.delete(attachment.storageKey)),
  );

  await prisma.$transaction([
    prisma.conversation.delete({ where: { id: conversationId } }),
    prisma.anonymousUser.update({ where: { id: conversation.anonymousUserId }, data: { status: "DELETED" } }),
  ]);
}
