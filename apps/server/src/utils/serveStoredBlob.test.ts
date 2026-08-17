import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../storage/types.js";
import { putCachedBlob } from "./blobCache.js";
import { serveStoredBlob } from "./serveStoredBlob.js";

/** In-memory storage adapter whose contents the tests control directly. */
function fakeStorage(files: Record<string, Buffer>): StorageAdapter {
  return {
    async put(key, data) {
      files[key] = data;
    },
    async get(key) {
      const data = files[key];
      if (!data) throw new Error("ENOENT");
      return data;
    },
    async delete(key) {
      delete files[key];
    },
    async putStream(key, stream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      files[key] = Buffer.concat(chunks);
    },
    async getStream(key) {
      const data = files[key];
      if (!data) throw new Error("ENOENT");
      return Readable.from(data);
    },
    async stat(key) {
      const data = files[key];
      return data ? { size: data.byteLength } : null;
    },
  };
}

/** A reply double that records what the route would send. */
function fakeReply() {
  const reply: {
    sent: { status?: number; body?: Buffer };
    header: () => typeof reply;
    send: (body: Buffer) => typeof reply;
  } = {
    sent: {},
    header() {
      return reply;
    },
    send(body) {
      reply.sent.body = body;
      return reply;
    },
  };
  return reply;
}

const VALID_BLOB = Buffer.concat([Buffer.alloc(24, 7), Buffer.alloc(40, 1)]); // nonce + ciphertext+tag

describe("serveStoredBlob", () => {
  it("404s when the object is missing", async () => {
    const reply = fakeReply();
    await expect(serveStoredBlob({ storage: fakeStorage({}), storageKey: "gone", reply: reply as never })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(reply.sent.body).toBeUndefined();
  });

  it.each([
    [0, "zero-byte object"],
    [10, "truncated object"],
    [23, "one byte short of a nonce"],
  ])("404s a %s (%s) instead of serving an undecryptable blob", async (_size, _label) => {
    const size = _size as number;
    const reply = fakeReply();
    const storage = fakeStorage({ "attachments/broken": Buffer.alloc(size, 3) });
    await expect(
      serveStoredBlob({ storage, storageKey: "attachments/broken", reply: reply as never }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(reply.sent.body).toBeUndefined();
  });

  it("serves a valid blob with its bytes", async () => {
    const reply = fakeReply();
    const storage = fakeStorage({ "attachments/ok": VALID_BLOB });
    await serveStoredBlob({ storage, storageKey: "attachments/ok", reply: reply as never });
    expect(reply.sent.body).toEqual(VALID_BLOB);
  });

  it("ignores a poisoned cache entry and serves the valid stored bytes", async () => {
    // A short blob must never be served from the in-memory cache either -
    // even if an earlier version cached it, fall through to storage.
    putCachedBlob("attachments/ok", Buffer.alloc(5, 9));
    const reply = fakeReply();
    const storage = fakeStorage({ "attachments/ok": VALID_BLOB });
    await serveStoredBlob({ storage, storageKey: "attachments/ok", reply: reply as never });
    expect(reply.sent.body).toEqual(VALID_BLOB);
  });
});
