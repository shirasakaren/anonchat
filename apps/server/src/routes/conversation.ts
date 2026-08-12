import type { FastifyInstance } from "fastify";
import {
  EditMessageRequestSchema,
  IdParamSchema,
  MessagesQuerySchema,
  ReactionRequestSchema,
  ReadReceiptRequestSchema,
} from "@anonchat/shared";
import { requireAnon } from "../auth/plugin.js";
import { prisma } from "../db.js";
import { loadEnv } from "../env.js";
import { createMessage, deleteMessage, editMessage, setReaction } from "../services/message.service.js";
import { countUnread, getMessagesPage, markRead, toConversationDto } from "../services/conversation.service.js";
import { getStorageAdapter } from "../storage/index.js";
import { Errors } from "../utils/errors.js";
import { parseSendMessageBody } from "../utils/multipartMessage.js";
import { checkRateLimit } from "../utils/rateLimiter.js";

export function registerConversationRoutes(app: FastifyInstance): void {
  app.get("/conversation", { preHandler: requireAnon }, async (request) => {
    const conversation = request.anonUser!.conversation!;
    const unreadCount = await countUnread(conversation.id, "USER");
    return toConversationDto(conversation, request.anonUser!, unreadCount);
  });

  app.get("/conversation/messages", { preHandler: requireAnon }, async (request) => {
    const conversation = request.anonUser!.conversation!;
    const query = MessagesQuerySchema.parse(request.query);
    return getMessagesPage(conversation.id, query);
  });

  app.post("/conversation/messages", { preHandler: requireAnon }, async (request, reply) => {
    const env = loadEnv();
    const conversation = request.anonUser!.conversation!;
    if (!checkRateLimit(`message:USER:${request.anonUser!.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const { content, replyToId, attachments } = await parseSendMessageBody(request, env.MAX_ATTACHMENTS_PER_MESSAGE);
    const dto = await createMessage({
      conversationId: conversation.id,
      senderType: "USER",
      content,
      replyToId,
      attachments,
    });
    reply.status(201).send(dto);
  });

  app.patch("/conversation/messages/:id", { preHandler: requireAnon }, async (request, reply) => {
    const env = loadEnv();
    const conversation = request.anonUser!.conversation!;
    if (!checkRateLimit(`message:USER:${request.anonUser!.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = IdParamSchema.parse(request.params);
    const body = EditMessageRequestSchema.parse(request.body);
    const dto = await editMessage({
      conversationId: conversation.id,
      messageId: params.id,
      senderType: "USER",
      content: body.content,
      editWindowMinutes: env.MESSAGE_EDIT_WINDOW_MINUTES,
    });
    reply.send(dto);
  });

  app.delete("/conversation/messages/:id", { preHandler: requireAnon }, async (request, reply) => {
    const env = loadEnv();
    const conversation = request.anonUser!.conversation!;
    if (!checkRateLimit(`message:USER:${request.anonUser!.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = IdParamSchema.parse(request.params);
    await deleteMessage({ conversationId: conversation.id, messageId: params.id, senderType: "USER" });
    reply.status(204).send();
  });

  app.post("/conversation/messages/:id/reactions", { preHandler: requireAnon }, async (request, reply) => {
    const env = loadEnv();
    const conversation = request.anonUser!.conversation!;
    if (!checkRateLimit(`message:USER:${request.anonUser!.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = IdParamSchema.parse(request.params);
    const body = ReactionRequestSchema.parse(request.body);
    await setReaction({ conversationId: conversation.id, messageId: params.id, senderType: "USER", emoji: body.emoji });
    reply.status(204).send();
  });

  app.delete("/conversation/messages/:id/reactions", { preHandler: requireAnon }, async (request, reply) => {
    const env = loadEnv();
    const conversation = request.anonUser!.conversation!;
    if (!checkRateLimit(`message:USER:${request.anonUser!.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = IdParamSchema.parse(request.params);
    await setReaction({ conversationId: conversation.id, messageId: params.id, senderType: "USER", emoji: null });
    reply.status(204).send();
  });

  app.post("/conversation/read", { preHandler: requireAnon }, async (request, reply) => {
    const conversation = request.anonUser!.conversation!;
    const body = ReadReceiptRequestSchema.parse(request.body);
    const result = await markRead(conversation.id, "USER", body.upToMessageId);
    if (!result) throw Errors.notFound();
    reply.send(result);
  });

  app.get("/conversation/attachments/:id", { preHandler: requireAnon }, async (request, reply) => {
    const conversation = request.anonUser!.conversation!;
    if (!checkRateLimit(`attachment-download:USER:${request.anonUser!.id}`, 60, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = IdParamSchema.parse(request.params);
    const attachment = await prisma.attachment.findFirst({
      where: { id: params.id, message: { conversationId: conversation.id } },
    });
    if (!attachment) throw Errors.notFound();
    const storage = getStorageAdapter();
    const buffer = await storage.get(attachment.storageKey);
    reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", "attachment")
      .header("Cache-Control", "private, no-store")
      .send(buffer);
  });
}
