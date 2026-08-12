import type { FastifyRequest } from "fastify";
import { EncryptedPayloadSchema, SendMessageRequestSchema, type EncryptedPayloadInput } from "@anonchat/shared";
import type { PendingAttachment } from "../services/message.service.js";
import { Errors } from "./errors.js";

/**
 * A "send message" request is either plain JSON (text only) or multipart
 * (text + N encrypted attachment blobs, each preceded by its own encrypted
 * metadata envelope field). See docs/ARCHITECTURE.md for why attachments are
 * uploaded atomically with the message rather than pre-staged server-side.
 */
export async function parseSendMessageBody(
  request: FastifyRequest,
  maxAttachments: number,
): Promise<{ content: EncryptedPayloadInput; replyToId: string | null; attachments: PendingAttachment[] }> {
  if (!request.isMultipart()) {
    const body = SendMessageRequestSchema.parse(request.body);
    return { content: body.content, replyToId: body.replyToId ?? null, attachments: [] };
  }

  let contentRaw: string | undefined;
  let replyToRaw: string | undefined;
  let pendingMeta: EncryptedPayloadInput | null = null;
  const attachments: PendingAttachment[] = [];

  try {
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname !== "attachment" || !pendingMeta) {
          throw Errors.badRequest("Malformed attachment upload.");
        }
        if (attachments.length >= maxAttachments) {
          throw Errors.badRequest(`You can attach at most ${maxAttachments} files per message.`);
        }
        const buffer = await part.toBuffer();
        attachments.push({ meta: pendingMeta, buffer });
        pendingMeta = null;
      } else if (part.fieldname === "content") {
        contentRaw = String(part.value);
      } else if (part.fieldname === "replyToId") {
        replyToRaw = String(part.value);
      } else if (part.fieldname === "attachmentMeta") {
        pendingMeta = EncryptedPayloadSchema.parse(JSON.parse(String(part.value)));
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") {
      throw Errors.tooLarge();
    }
    throw error;
  }

  if (!contentRaw) throw Errors.badRequest("Message content is required.");
  const content = EncryptedPayloadSchema.parse(JSON.parse(contentRaw));
  return { content, replyToId: replyToRaw || null, attachments };
}
