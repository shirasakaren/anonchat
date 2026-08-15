import { describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { S3StorageAdapter, type S3StorageOptions } from "./s3Storage.js";

/** Minimal fake of the S3Client surface the adapter uses. */
function fakeClient(handlers: Record<string, () => Promise<unknown>>) {
  const sent: string[] = [];
  const client = {
    send: vi.fn(async (command: { constructor: { name: string } }) => {
      const name = command.constructor.name;
      sent.push(name);
      const handler = handlers[name];
      if (!handler) throw new Error(`unexpected command ${name}`);
      return handler();
    }),
  };
  return { client, sent };
}

const options: S3StorageOptions = {
  region: "us-east-1",
  bucket: "anonchat",
  accessKeyId: "key",
  secretAccessKey: "secret",
  forcePathStyle: true,
};

const notFound = Object.assign(new Error("NotFound"), {
  name: "NotFound",
  $metadata: { httpStatusCode: 404 },
});

describe("S3StorageAdapter bucket lifecycle", () => {
  it("creates the bucket once when it does not exist", async () => {
    const { client, sent } = fakeClient({
      HeadBucketCommand: () => Promise.reject(notFound),
      CreateBucketCommand: () => Promise.resolve({}),
      PutObjectCommand: () => Promise.resolve({}),
    });

    const adapter = new S3StorageAdapter(options, client as unknown as S3Client);
    await adapter.put("a/b.txt", Buffer.from("hello"));

    expect(sent).toEqual(["HeadBucketCommand", "CreateBucketCommand", "PutObjectCommand"]);
  });

  it("skips creation when the bucket already exists", async () => {
    const { client, sent } = fakeClient({
      HeadBucketCommand: () => Promise.resolve({}),
      PutObjectCommand: () => Promise.resolve({}),
    });

    const adapter = new S3StorageAdapter(options, client as unknown as S3Client);
    await adapter.put("a/b.txt", Buffer.from("hello"));

    expect(sent).toEqual(["HeadBucketCommand", "PutObjectCommand"]);
  });

  it("runs HeadBucket once across concurrent first writes", async () => {
    let creates = 0;
    const { client, sent } = fakeClient({
      HeadBucketCommand: () => Promise.reject(notFound),
      CreateBucketCommand: () => {
        creates += 1;
        return Promise.resolve({});
      },
      PutObjectCommand: () => Promise.resolve({}),
    });

    const adapter = new S3StorageAdapter(options, client as unknown as S3Client);
    await Promise.all([adapter.put("a", Buffer.from("a")), adapter.put("b", Buffer.from("b"))]);

    expect(sent.filter((c) => c === "HeadBucketCommand")).toHaveLength(1);
    expect(sent.filter((c) => c === "CreateBucketCommand")).toHaveLength(1);
    expect(creates).toBe(1);
  });

  it("tolerates losing a concurrent create race", async () => {
    const alreadyOwned = Object.assign(new Error("BucketAlreadyOwnedByYou"), {
      name: "BucketAlreadyOwnedByYou",
      $metadata: { httpStatusCode: 409 },
    });
    const { client, sent } = fakeClient({
      HeadBucketCommand: () => Promise.reject(notFound),
      CreateBucketCommand: () => Promise.reject(alreadyOwned),
      PutObjectCommand: () => Promise.resolve({}),
    });

    const adapter = new S3StorageAdapter(options, client as unknown as S3Client);
    await expect(adapter.put("a", Buffer.from("a"))).resolves.toBeUndefined();

    expect(sent).toEqual(["HeadBucketCommand", "CreateBucketCommand", "PutObjectCommand"]);
  });

  it("surfaces real HeadBucket failures", async () => {
    const denied = Object.assign(new Error("AccessDenied"), { name: "AccessDenied" });
    const { client } = fakeClient({
      HeadBucketCommand: () => Promise.reject(denied),
    });

    const adapter = new S3StorageAdapter(options, client as unknown as S3Client);
    await expect(adapter.put("a", Buffer.from("a"))).rejects.toThrow("AccessDenied");
  });
});
