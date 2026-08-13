import type { FastifyInstance } from "fastify";
import {
  AdminConversationsQuerySchema,
  ConversationAliasRequestSchema,
  ConversationAttachmentParamsSchema,
  ConversationMessageParamsSchema,
  EditMessageRequestSchema,
  IdParamSchema,
  MessagesQuerySchema,
  ReactionRequestSchema,
  ReadReceiptRequestSchema,
} from "@anonchat/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { prisma } from "../../db.js";
import { loadEnv } from "../../env.js";
import {
  getConversationForAdmin,
  getMessagesPage,
  hardDeleteConversation,
  listConversationsForAdmin,
  markRead,
  restoreConversation,
  setConversationAlias,
  setConversationMuted,
  setConversationStatus,
  softDeleteConversation,
} from "../../services/conversation.service.js";
import { createMessage, deleteMessage, editMessage, setReaction } from "../../services/message.service.js";
import { recordAudit } from "../../services/auditLog.service.js";
import { getStorageAdapter } from "../../storage/index.js";
import { Errors } from "../../utils/errors.js";
import { parseSendMessageBody } from "../../utils/multipartMessage.js";
import { checkRateLimit } from "../../utils/rateLimiter.js";

const ConversationIdParam = IdParamSchema;

export function registerAdminConversationRoutes(app: FastifyInstance): void {
  app.get("/admin/conversations", { preHandler: requireAdmin }, async (request) => {
    const query = AdminConversationsQuerySchema.parse(request.query);
    return listConversationsForAdmin(query);
  });

  app.get("/admin/conversations/:id", { preHandler: requireAdmin }, async (request) => {
    const params = ConversationIdParam.parse(request.params);
    return getConversationForAdmin(params.id);
  });

  app.get("/admin/conversations/:id/messages", { preHandler: requireAdmin }, async (request) => {
    const params = ConversationIdParam.parse(request.params);
    await getConversationForAdmin(params.id); // 404s if missing/soft-deleted
    const query = MessagesQuerySchema.parse(request.query);
    return getMessagesPage(params.id, query);
  });

  app.post("/admin/conversations/:id/messages", { preHandler: requireAdmin }, async (request, reply) => {
    const env = loadEnv();
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    if (!checkRateLimit(`message:ADMIN:${admin.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const { content, replyToId, attachments } = await parseSendMessageBody(request, env.MAX_ATTACHMENTS_PER_MESSAGE);
    const dto = await createMessage({
      conversationId: params.id,
      senderType: "ADMIN",
      content,
      replyToId,
      attachments,
    });
    reply.status(201).send(dto);
  });

  app.patch("/admin/conversations/:id/messages/:messageId", { preHandler: requireAdmin }, async (request, reply) => {
    const env = loadEnv();
    const { admin } = request.adminAuth!;
    if (!checkRateLimit(`message:ADMIN:${admin.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = ConversationMessageParamsSchema.parse(request.params);
    const body = EditMessageRequestSchema.parse(request.body);
    const dto = await editMessage({
      conversationId: params.id,
      messageId: params.messageId,
      senderType: "ADMIN",
      content: body.content,
      editWindowMinutes: env.MESSAGE_EDIT_WINDOW_MINUTES,
    });
    await recordAudit(admin.id, "message.edited", { type: "Message", id: params.messageId });
    reply.send(dto);
  });

  app.delete("/admin/conversations/:id/messages/:messageId", { preHandler: requireAdmin }, async (request, reply) => {
    const env = loadEnv();
    const { admin } = request.adminAuth!;
    if (!checkRateLimit(`message:ADMIN:${admin.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = ConversationMessageParamsSchema.parse(request.params);
    await deleteMessage({ conversationId: params.id, messageId: params.messageId, senderType: "ADMIN" });
    await recordAudit(admin.id, "message.deleted", { type: "Message", id: params.messageId });
    reply.status(204).send();
  });

  app.post(
    "/admin/conversations/:id/messages/:messageId/reactions",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const env = loadEnv();
      const { admin } = request.adminAuth!;
      if (!checkRateLimit(`message:ADMIN:${admin.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
        throw Errors.rateLimited();
      }
      const params = ConversationMessageParamsSchema.parse(request.params);
      const body = ReactionRequestSchema.parse(request.body);
      await setReaction({
        conversationId: params.id,
        messageId: params.messageId,
        senderType: "ADMIN",
        emoji: body.emoji,
      });
      await recordAudit(admin.id, "message.reaction.set", { type: "Message", id: params.messageId });
      reply.status(204).send();
    },
  );

  app.delete(
    "/admin/conversations/:id/messages/:messageId/reactions",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const env = loadEnv();
      const { admin } = request.adminAuth!;
      if (!checkRateLimit(`message:ADMIN:${admin.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE, 60_000)) {
        throw Errors.rateLimited();
      }
      const params = ConversationMessageParamsSchema.parse(request.params);
      await setReaction({ conversationId: params.id, messageId: params.messageId, senderType: "ADMIN", emoji: null });
      await recordAudit(admin.id, "message.reaction.cleared", { type: "Message", id: params.messageId });
      reply.status(204).send();
    },
  );

  app.post("/admin/conversations/:id/read", { preHandler: requireAdmin }, async (request, reply) => {
    const params = ConversationIdParam.parse(request.params);
    const body = ReadReceiptRequestSchema.parse(request.body);
    const result = await markRead(params.id, "ADMIN", body.upToMessageId);
    if (!result) throw Errors.notFound();
    reply.send(result);
  });

  app.get(
    "/admin/conversations/:id/attachments/:attachmentId",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { admin } = request.adminAuth!;
      if (!checkRateLimit(`attachment-download:ADMIN:${admin.id}`, 60, 60_000)) {
        throw Errors.rateLimited();
      }
      const params = ConversationAttachmentParamsSchema.parse(request.params);
      const attachment = await prisma.attachment.findFirst({
        where: { id: params.attachmentId, message: { conversationId: params.id } },
      });
      if (!attachment) throw Errors.notFound();
      const storage = getStorageAdapter();
      const buffer = await storage.get(attachment.storageKey);
      reply
        .header("Content-Type", "application/octet-stream")
        .header("Content-Disposition", "attachment")
        .header("Cache-Control", "private, no-store")
        .send(buffer);
    },
  );

  app.post("/admin/conversations/:id/archive", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const dto = await setConversationStatus(params.id, "ARCHIVED");
    await recordAudit(admin.id, "conversation.archived", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.post("/admin/conversations/:id/unarchive", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const dto = await setConversationStatus(params.id, "ACTIVE");
    await recordAudit(admin.id, "conversation.unarchived", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.post("/admin/conversations/:id/block", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const dto = await setConversationStatus(params.id, "BLOCKED");
    await recordAudit(admin.id, "conversation.blocked", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.post("/admin/conversations/:id/unblock", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const dto = await setConversationStatus(params.id, "ACTIVE");
    await recordAudit(admin.id, "conversation.unblocked", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.patch("/admin/conversations/:id/alias", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const body = ConversationAliasRequestSchema.parse(request.body);
    const dto = await setConversationAlias(params.id, body.alias);
    await recordAudit(admin.id, "conversation.alias_updated", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.post("/admin/conversations/:id/mute", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const dto = await setConversationMuted(params.id, true);
    await recordAudit(admin.id, "conversation.muted", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.post("/admin/conversations/:id/unmute", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const dto = await setConversationMuted(params.id, false);
    await recordAudit(admin.id, "conversation.unmuted", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.post("/admin/conversations/:id/restore", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const dto = await restoreConversation(params.id);
    await recordAudit(admin.id, "conversation.restored", { type: "Conversation", id: params.id });
    reply.send(dto);
  });

  app.delete("/admin/conversations/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    await softDeleteConversation(params.id);
    await recordAudit(admin.id, "conversation.deleted.soft", { type: "Conversation", id: params.id });
    reply.status(204).send();
  });

  app.delete("/admin/conversations/:id/permanent", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    await hardDeleteConversation(params.id);
    await recordAudit(admin.id, "conversation.deleted.permanent", { type: "Conversation", id: params.id });
    reply.status(204).send();
  });
}
