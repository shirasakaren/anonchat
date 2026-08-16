import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { dirname, join, normalize, relative } from "node:path";
import type { StorageAdapter } from "./types.js";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const full = normalize(join(this.rootDir, key));
    const rel = relative(this.rootDir, full);
    if (rel.startsWith("..")) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async putStream(key: string, stream: Readable): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await pipeline(stream, createWriteStream(path));
  }

  getStream(key: string): Promise<Readable> {
    return Promise.resolve(createReadStream(this.resolve(key)));
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const info = await stat(this.resolve(key));
      return { size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
