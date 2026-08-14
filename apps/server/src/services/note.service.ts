import { randomBytes } from "node:crypto";
import type { ConversationNote, NoteAsset, SenderType } from "@prisma/client";
import type { ConversationNoteDto, EncryptedPayloadInput, NoteAssetDto } from "@anonchat/shared";
import { prisma } from "../db.js";
import { publishToConversation } from "../realtime/hub.js";
import { getStorageAdapter } from "../storage/index.js";
import { Errors } from "../utils/errors.js";
import { encryptedPayloadFromColumns } from "../utils/dto.js";

function payloadToColumns(payload: EncryptedPayloadInput) {
  return {
    contentCiphertext: Buffer.from(payload.ciphertext, "base64url"),
    contentNonce: Buffer.from(payload.nonce, "base64url"),
  };
}

function toNoteDto(note: ConversationNote): ConversationNoteDto {
  return {
    id: note.id,
    conversationId: note.conversationId,
    content: encryptedPayloadFromColumns(note.contentCiphertext, note.contentNonce)!,
    updatedBy: note.updatedBy,
    updatedAt: note.updatedAt.toISOString(),
  };
}

function toAssetDto(asset: NoteAsset): NoteAssetDto {
  return {
    id: asset.id,
    conversationId: asset.conversationId,
    meta: encryptedPayloadFromColumns(asset.metaCiphertext, asset.metaNonce)!,
    sizeBytes: asset.sizeBytes,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function getConversationNote(conversationId: string): Promise<ConversationNoteDto | null> {
  const note = await prisma.conversationNote.findUnique({ where: { conversationId } });
  return note ? toNoteDto(note) : null;
}

export async function saveConversationNote(
  conversationId: string,
  content: EncryptedPayloadInput,
  updatedBy: SenderType,
): Promise<ConversationNoteDto> {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, deletedAt: null } });
  if (!conversation) throw Errors.notFound();
  if (updatedBy === "USER" && conversation.status === "BLOCKED") throw Errors.blocked();
  const columns = payloadToColumns(content);
  const note = await prisma.conversationNote.upsert({
    where: { conversationId },
    create: { conversationId, updatedBy, ...columns },
    update: { updatedBy, ...columns },
  });
  const dto = toNoteDto(note);
  publishToConversation(conversationId, { type: "note.updated", conversationId, note: dto });
  return dto;
}

export async function createNoteAsset(params: {
  conversationId: string;
  meta: EncryptedPayloadInput;
  buffer: Buffer;
  senderType: SenderType;
}): Promise<NoteAssetDto> {
  const conversation = await prisma.conversation.findFirst({ where: { id: params.conversationId, deletedAt: null } });
  if (!conversation) throw Errors.notFound();
  if (params.senderType === "USER" && conversation.status === "BLOCKED") throw Errors.blocked();
  const existingCount = await prisma.noteAsset.count({ where: { conversationId: params.conversationId } });
  if (existingCount >= 25) {
    throw Errors.badRequest("A conversation note can contain at most 25 uploaded assets.");
  }
  const key = `note-assets/${randomBytes(24).toString("hex")}`;
  const storage = getStorageAdapter();
  try {
    await storage.put(key, params.buffer);
    const metaCiphertext = Buffer.from(params.meta.ciphertext, "base64url");
    const metaNonce = Buffer.from(params.meta.nonce, "base64url");
    const asset = await prisma.noteAsset.create({
      data: {
        conversationId: params.conversationId,
        storageKey: key,
        metaCiphertext,
        metaNonce,
        sizeBytes: params.buffer.byteLength,
      },
    });
    return toAssetDto(asset);
  } catch (error) {
    await storage.delete(key).catch(() => {});
    throw error;
  }
}

export async function getNoteAsset(conversationId: string, assetId: string): Promise<Buffer> {
  const asset = await prisma.noteAsset.findFirst({ where: { id: assetId, conversationId } });
  if (!asset) throw Errors.notFound();
  return getStorageAdapter().get(asset.storageKey);
}

export async function deleteNoteAsset(conversationId: string, assetId: string): Promise<void> {
  const asset = await prisma.noteAsset.findFirst({ where: { id: assetId, conversationId } });
  if (!asset) return;
  await prisma.noteAsset.delete({ where: { id: asset.id } });
  await getStorageAdapter()
    .delete(asset.storageKey)
    .catch(() => {});
}
