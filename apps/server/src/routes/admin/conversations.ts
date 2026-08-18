import type { FastifyInstance } from "fastify";
import {
  AdminConversationsQuerySchema,
  BulkConversationsRequestSchema,
  ConversationAliasRequestSchema,
  ConversationAttachmentParamsSchema,
  ConversationMessageParamsSchema,
  EditMessageRequestSchema,
  IdParamSchema,
  MessagesQuerySchema,
  ReactionRequestSchema,
  ReadReceiptRequestSchema,
  RetentionRequestSchema,
} from "@anonchat/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { prisma } from "../../db.js";
import {
  getConversationForAdmin,
  getMessagesPage,
  hardDeleteConversation,
  listConversationsForAdmin,
  markRead,
  restoreConversation,
  setConversationAlias,
  setConversationMuted,
  setConversationRetention,
  setConversationStatus,
  softDeleteConversation,
} from "../../services/conversation.service.js";
import { createMessage, deleteMessage, editMessage, setReaction } from "../../services/message.service.js";
import { recordAudit } from "../../services/auditLog.service.js";
import { getStorageAdapter } from "../../storage/index.js";
import { Errors } from "../../utils/errors.js";
import { parseSendMessageBody } from "../../utils/multipartMessage.js";
import { getSiteSettings } from "../../services/siteSettings.service.js";
import { checkRateLimit } from "../../utils/rateLimiter.js";
import { serveStoredBlob } from "../../utils/serveStoredBlob.js";

const ConversationIdParam = IdParamSchema;

export function registerAdminConversationRoutes(app: FastifyInstance): void {
  app.get("/admin/conversations", { preHandler: requireAdmin }, async (request) => {
    const query = AdminConversationsQuerySchema.parse(request.query);
    return listConversationsForAdmin(query);
  });

  // Bulk inbox operations: checkbox selection -> archive/delete/block many
  // conversations in one request. Each status change still broadcasts its
  // own conversation.updated event so open clients stay live.
  app.post("/admin/conversations/bulk", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const { ids, action } = BulkConversationsRequestSchema.parse(request.body);
    for (const id of ids) {
      switch (action) {
        case "archive":
          await setConversationStatus(id, "ARCHIVED");
          break;
        case "unarchive":
          await setConversationStatus(id, "ACTIVE");
          break;
        case "block":
          await setConversationStatus(id, "BLOCKED");
          break;
        case "unblock":
          await setConversationStatus(id, "ACTIVE");
          break;
        case "delete":
          await softDeleteConversation(id);
          break;
      }
    }
    await recordAudit(admin.id, "conversation.bulk_action", undefined, { action, count: ids.length });
    reply.status(204).send();
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
    const settings = await getSiteSettings();
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    if (!checkRateLimit(`message:ADMIN:${admin.id}`, settings.rateLimitMessagesPerMinute, 60_000)) {
      throw Errors.rateLimited();
    }
    const { content, replyToId, clientId, attachments } = await parseSendMessageBody(
      request,
      settings.maxAttachmentsPerMessage,
      settings.maxAttachmentSizeMb,
    );
    const dto = await createMessage({
      conversationId: params.id,
      senderType: "ADMIN",
      content,
      replyToId,
      clientId,
      attachments,
    });
    reply.status(201).send(dto);
  });

  app.patch("/admin/conversations/:id/messages/:messageId", { preHandler: requireAdmin }, async (request, reply) => {
    const settings = await getSiteSettings();
    const { admin } = request.adminAuth!;
    if (!checkRateLimit(`message:ADMIN:${admin.id}`, settings.rateLimitMessagesPerMinute, 60_000)) {
      throw Errors.rateLimited();
    }
    const params = ConversationMessageParamsSchema.parse(request.params);
    const body = EditMessageRequestSchema.parse(request.body);
    const dto = await editMessage({
      conversationId: params.id,
      messageId: params.messageId,
      senderType: "ADMIN",
      content: body.content,
      editWindowMinutes: settings.messageEditWindowMinutes,
    });
    await recordAudit(admin.id, "message.edited", { type: "Message", id: params.messageId });
    reply.send(dto);
  });

  app.delete("/admin/conversations/:id/messages/:messageId", { preHandler: requireAdmin }, async (request, reply) => {
    const settings = await getSiteSettings();
    const { admin } = request.adminAuth!;
    if (!checkRateLimit(`message:ADMIN:${admin.id}`, settings.rateLimitMessagesPerMinute, 60_000)) {
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
      const settings = await getSiteSettings();
      const { admin } = request.adminAuth!;
      if (!checkRateLimit(`message:ADMIN:${admin.id}`, settings.rateLimitMessagesPerMinute, 60_000)) {
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
      const settings = await getSiteSettings();
      const { admin } = request.adminAuth!;
      if (!checkRateLimit(`message:ADMIN:${admin.id}`, settings.rateLimitMessagesPerMinute, 60_000)) {
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
      // One chat with a page of photos re-fetches every attachment on each
      // view; the old 60/min budget tripped on a single conversation reload.
      if (!checkRateLimit(`attachment-download:ADMIN:${admin.id}`, 300, 60_000)) {
        throw Errors.rateLimited();
      }
      const params = ConversationAttachmentParamsSchema.parse(request.params);
      const attachment = await prisma.attachment.findFirst({
        where: { id: params.attachmentId, message: { conversationId: params.id } },
      });
      if (!attachment) throw Errors.notFound();
      await serveStoredBlob({ storage: getStorageAdapter(), storageKey: attachment.storageKey, reply });
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

  app.patch("/admin/conversations/:id/retention", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = ConversationIdParam.parse(request.params);
    const body = RetentionRequestSchema.parse(request.body);
    const dto = await setConversationRetention(params.id, body);
    await recordAudit(admin.id, "conversation.retention_updated", { type: "Conversation", id: params.id });
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
