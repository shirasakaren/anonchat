import type { FastifyRequest } from "fastify";
import { EncryptedPayloadSchema, type EncryptedPayloadInput } from "@anonchat/shared";
import { Errors } from "./errors.js";

export async function parseNoteAssetUpload(
  request: FastifyRequest,
): Promise<{ meta: EncryptedPayloadInput; buffer: Buffer }> {
  if (!request.isMultipart()) throw Errors.badRequest("A multipart note asset is required.");
  let meta: EncryptedPayloadInput | null = null;
  let buffer: Buffer | null = null;
  try {
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname !== "asset" || buffer) throw Errors.badRequest("Malformed note asset upload.");
        buffer = await part.toBuffer();
      } else if (part.fieldname === "meta") {
        meta = EncryptedPayloadSchema.parse(JSON.parse(String(part.value)));
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") {
      throw Errors.tooLarge();
    }
    throw error;
  }
  if (!meta || !buffer) throw Errors.badRequest("The encrypted asset and metadata are required.");
  return { meta, buffer };
}
