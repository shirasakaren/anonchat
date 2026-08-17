import { XCHACHA_NONCE_BYTES } from "@anonchat/crypto";
import type { FastifyReply } from "fastify";
import type { StorageAdapter } from "../storage/types.js";
import { Errors } from "./errors.js";
import { getCachedBlob, MAX_ENTRY_BYTES, putCachedBlob } from "./blobCache.js";

/**
 * Every stored attachment blob is at least nonce + AEAD tag, so anything
 * shorter than the nonce was never a valid encrypted file (a truncated or
 * zero-byte write). Serving it would end in the client's "empty or
 * damaged" decrypt error - report it as missing instead.
 */
function isUndecryptable(size: number): boolean {
  return size < XCHACHA_NONCE_BYTES;
}

/**
 * Shared download path for stored attachment/asset blobs. Three layers:
 * 1. in-memory ciphertext cache (repeat views of the same conversation
 *    never touch storage), then
 * 2. a stat check that turns a missing object into a clean 404 - without
 *    it, a vanished file streams as a truncated 200 and the client's
 *    decrypt step fails with a baffling "nonce" error - then
 * 3. small objects buffered (and cached) whole, large objects streamed.
 */
export async function serveStoredBlob(options: {
  storage: StorageAdapter;
  storageKey: string;
  reply: FastifyReply;
}): Promise<void> {
  const { storage, storageKey, reply } = options;

  const cached = getCachedBlob(storageKey);
  if (cached && !isUndecryptable(cached.byteLength)) {
    reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", "attachment")
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Length", String(cached.byteLength))
      .send(cached);
    return;
  }

  const info = await storage.stat(storageKey);
  if (!info || isUndecryptable(info.size)) {
    throw Errors.notFound("This attachment is no longer stored on the server.");
  }

  if (info.size <= MAX_ENTRY_BYTES) {
    const buffer = await storage.get(storageKey);
    putCachedBlob(storageKey, buffer);
    reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", "attachment")
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Length", String(buffer.byteLength))
      .send(buffer);
    return;
  }

  // Large objects stream straight out of storage - never buffered whole.
  const stream = await storage.getStream(storageKey);
  reply
    .header("Content-Type", "application/octet-stream")
    .header("Content-Disposition", "attachment")
    .header("Cache-Control", "private, max-age=3600")
    .header("Content-Length", String(info.size))
    .send(stream);
}
