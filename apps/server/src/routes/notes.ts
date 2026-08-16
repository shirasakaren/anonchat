import type { FastifyInstance } from "fastify";
import { IdParamSchema, SaveConversationNoteRequestSchema } from "@anonchat/shared";
import { requireAdmin, requireAnon } from "../auth/plugin.js";
import { getConversationForAdmin } from "../services/conversation.service.js";
import {
  createNoteAsset,
  deleteNoteAsset,
  getConversationNote,
  getNoteAsset,
  saveConversationNote,
} from "../services/note.service.js";
import { parseNoteAssetUpload } from "../utils/multipartNoteAsset.js";
import { checkRateLimit } from "../utils/rateLimiter.js";
import { Errors } from "../utils/errors.js";
import { getSiteSettings } from "../services/siteSettings.service.js";
import { getStorageAdapter } from "../storage/index.js";
import { serveStoredBlob } from "../utils/serveStoredBlob.js";

export function registerNoteRoutes(app: FastifyInstance): void {
  app.get("/conversation/note", { preHandler: requireAnon }, async (request) => ({
    note: await getConversationNote(request.anonUser!.conversation!.id),
  }));

  app.put("/conversation/note", { preHandler: requireAnon }, async (request) => {
    const settings = await getSiteSettings();
    if (!checkRateLimit(`note:USER:${request.anonUser!.id}`, settings.rateLimitMessagesPerMinute * 3, 60_000)) {
      throw Errors.rateLimited("You're saving this note too quickly. Please wait a moment.");
    }
    const body = SaveConversationNoteRequestSchema.parse(request.body);
    return saveConversationNote(request.anonUser!.conversation!.id, body.content, "USER");
  });

  app.post("/conversation/note/assets", { preHandler: requireAnon }, async (request, reply) => {
    if (!checkRateLimit(`note-asset:USER:${request.anonUser!.id}`, 10, 60_000)) throw Errors.rateLimited();
    const settings = await getSiteSettings();
    const upload = await parseNoteAssetUpload(request, settings.maxAttachmentSizeMb);
    const asset = await createNoteAsset({
      conversationId: request.anonUser!.conversation!.id,
      senderType: "USER",
      ...upload,
    });
    reply.status(201).send(asset);
  });

  app.get("/conversation/note/assets/:id", { preHandler: requireAnon }, async (request, reply) => {
    if (!checkRateLimit(`note-asset-get:USER:${request.anonUser!.id}`, 120, 60_000)) throw Errors.rateLimited();
    const { id } = IdParamSchema.parse(request.params);
    const { storageKey } = await getNoteAsset(request.anonUser!.conversation!.id, id);
    await serveStoredBlob({ storage: getStorageAdapter(), storageKey, reply });
  });

  app.delete("/conversation/note/assets/:id", { preHandler: requireAnon }, async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    await deleteNoteAsset(request.anonUser!.conversation!.id, id);
    reply.status(204).send();
  });

  app.get("/admin/conversations/:id/note", { preHandler: requireAdmin }, async (request) => {
    const { id } = IdParamSchema.parse(request.params);
    await getConversationForAdmin(id);
    return { note: await getConversationNote(id) };
  });

  app.put("/admin/conversations/:id/note", { preHandler: requireAdmin }, async (request) => {
    const { id } = IdParamSchema.parse(request.params);
    await getConversationForAdmin(id);
    const { admin } = request.adminAuth!;
    const settings = await getSiteSettings();
    if (!checkRateLimit(`note:ADMIN:${admin.id}`, settings.rateLimitMessagesPerMinute * 3, 60_000)) {
      throw Errors.rateLimited("You're saving this note too quickly. Please wait a moment.");
    }
    const body = SaveConversationNoteRequestSchema.parse(request.body);
    return saveConversationNote(id, body.content, "ADMIN");
  });

  app.post("/admin/conversations/:id/note/assets", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    await getConversationForAdmin(id);
    const { admin } = request.adminAuth!;
    if (!checkRateLimit(`note-asset:ADMIN:${admin.id}`, 10, 60_000)) throw Errors.rateLimited();
    const settings = await getSiteSettings();
    const upload = await parseNoteAssetUpload(request, settings.maxAttachmentSizeMb);
    const asset = await createNoteAsset({ conversationId: id, senderType: "ADMIN", ...upload });
    reply.status(201).send(asset);
  });

  app.get("/admin/conversations/:id/note/assets/:assetId", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string; assetId: string };
    const { id } = IdParamSchema.parse({ id: params.id });
    const { id: assetId } = IdParamSchema.parse({ id: params.assetId });
    await getConversationForAdmin(id);
    const { admin } = request.adminAuth!;
    if (!checkRateLimit(`note-asset-get:ADMIN:${admin.id}`, 120, 60_000)) throw Errors.rateLimited();
    const { storageKey } = await getNoteAsset(id, assetId);
    await serveStoredBlob({ storage: getStorageAdapter(), storageKey, reply });
  });

  app.delete("/admin/conversations/:id/note/assets/:assetId", { preHandler: requireAdmin }, async (request, reply) => {
    const params = request.params as { id: string; assetId: string };
    const { id } = IdParamSchema.parse({ id: params.id });
    const { id: assetId } = IdParamSchema.parse({ id: params.assetId });
    await getConversationForAdmin(id);
    await deleteNoteAsset(id, assetId);
    reply.status(204).send();
  });
}
