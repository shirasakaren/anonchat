import type { FastifyInstance } from "fastify";
import { IdParamSchema, SaveConversationNoteRequestSchema } from "@anonchat/shared";
import { requireAdmin, requireAnon } from "../auth/plugin.js";
import { loadEnv } from "../env.js";
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

export function registerNoteRoutes(app: FastifyInstance): void {
  app.get("/conversation/note", { preHandler: requireAnon }, async (request) => ({
    note: await getConversationNote(request.anonUser!.conversation!.id),
  }));

  app.put("/conversation/note", { preHandler: requireAnon }, async (request) => {
    const env = loadEnv();
    if (!checkRateLimit(`note:USER:${request.anonUser!.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE * 3, 60_000)) {
      throw Errors.rateLimited("You're saving this note too quickly. Please wait a moment.");
    }
    const body = SaveConversationNoteRequestSchema.parse(request.body);
    return saveConversationNote(request.anonUser!.conversation!.id, body.content, "USER");
  });

  app.post("/conversation/note/assets", { preHandler: requireAnon }, async (request, reply) => {
    if (!checkRateLimit(`note-asset:USER:${request.anonUser!.id}`, 10, 60_000)) throw Errors.rateLimited();
    const upload = await parseNoteAssetUpload(request);
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
    const buffer = await getNoteAsset(request.anonUser!.conversation!.id, id);
    reply.header("Content-Type", "application/octet-stream").header("Cache-Control", "private, no-store").send(buffer);
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
    const env = loadEnv();
    if (!checkRateLimit(`note:ADMIN:${admin.id}`, env.RATE_LIMIT_MESSAGES_PER_MINUTE * 3, 60_000)) {
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
    const upload = await parseNoteAssetUpload(request);
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
    const buffer = await getNoteAsset(id, assetId);
    reply.header("Content-Type", "application/octet-stream").header("Cache-Control", "private, no-store").send(buffer);
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
