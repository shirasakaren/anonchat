import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { ENCRYPTED_BLOB_OVERHEAD_BYTES } from "@anonchat/crypto";
import { EncryptedPayloadSchema, SendMessageRequestSchema, type EncryptedPayloadInput } from "@anonchat/shared";
import type { PendingAttachment } from "../services/message.service.js";
import { getStorageAdapter } from "../storage/index.js";
import { Errors } from "./errors.js";

/**
 * A "send message" request is either plain JSON (text only) or multipart
 * (text + N encrypted attachment blobs, each preceded by its own encrypted
 * metadata envelope field). See docs/ARCHITECTURE.md for why attachments are
 * uploaded atomically with the message rather than pre-staged server-side.
 *
 * File parts are streamed straight into the storage adapter AS they are
 * parsed - the multipart parser is strictly sequential, so a file part's
 * stream must be fully consumed before the next part can be read. That
 * constraint is exactly what makes this safe memory-wise too: no part ever
 * buffers in the heap, and the parts iterator only advances once a part has
 * been drained to disk/object storage.
 */
export async function parseSendMessageBody(
  request: FastifyRequest,
  maxAttachments: number,
  maxAttachmentSizeMb: number,
): Promise<{ content: EncryptedPayloadInput; replyToId: string | null; clientId: string | null; attachments: PendingAttachment[] }> {
  if (!request.isMultipart()) {
    const body = SendMessageRequestSchema.parse(request.body);
    return { content: body.content, replyToId: body.replyToId ?? null, clientId: body.clientId ?? null, attachments: [] };
  }

  let contentRaw: string | undefined;
  let replyToRaw: string | undefined;
  let clientIdRaw: string | undefined;
  let pendingMeta: EncryptedPayloadInput | null = null;
  const attachments: PendingAttachment[] = [];
  const storage = getStorageAdapter();

  try {
    for await (const part of request.parts({
      limits: {
        fileSize: maxAttachmentSizeMb * 1024 * 1024 + ENCRYPTED_BLOB_OVERHEAD_BYTES,
        files: maxAttachments,
        fields: maxAttachments + 2,
        parts: maxAttachments * 2 + 4,
      },
    })) {
      if (part.type === "file") {
        if (part.fieldname !== "attachment" || !pendingMeta) {
          throw Errors.badRequest("Malformed attachment upload.");
        }
        if (attachments.length >= maxAttachments) {
          throw Errors.badRequest(`You can attach at most ${maxAttachments} files per message.`);
        }
        const storageKey = `attachments/${randomBytes(24).toString("hex")}`;
        await storage.putStream(storageKey, part.file);
        if (part.file.truncated) throw Errors.tooLarge(`Attachments must be ${maxAttachmentSizeMb} MB or smaller.`);
        attachments.push({ meta: pendingMeta, storageKey, sizeBytes: part.file.bytesRead });
        pendingMeta = null;
      } else if (part.fieldname === "content") {
        contentRaw = String(part.value);
      } else if (part.fieldname === "replyToId") {
        replyToRaw = String(part.value);
      } else if (part.fieldname === "clientId") {
        clientIdRaw = String(part.value);
      } else if (part.fieldname === "attachmentMeta") {
        pendingMeta = EncryptedPayloadSchema.parse(JSON.parse(String(part.value)));
      }
    }
  } catch (error) {
    // Parts already stored must not leak if a later part fails validation.
    await Promise.allSettled(attachments.map((attachment) => storage.delete(attachment.storageKey)));
    if (error && typeof error === "object" && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") {
      throw Errors.tooLarge(`Attachments must be ${maxAttachmentSizeMb} MB or smaller.`);
    }
    throw error;
  }

  if (!contentRaw) throw Errors.badRequest("Message content is required.");
  const content = EncryptedPayloadSchema.parse(JSON.parse(contentRaw));
  return { content, replyToId: replyToRaw || null, clientId: clientIdRaw || null, attachments };
}
