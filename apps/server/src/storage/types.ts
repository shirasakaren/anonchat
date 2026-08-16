import type { Readable } from "node:stream";

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Streams bytes into storage without buffering the whole object in
   *  memory - used by the message-attachment path so a 100MB upload never
   *  becomes a 100MB heap buffer. */
  putStream(key: string, stream: Readable): Promise<void>;
  /** Streams bytes out of storage - used by attachment downloads. */
  getStream(key: string): Promise<Readable>;
}
