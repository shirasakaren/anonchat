import { describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { S3StorageAdapter, normalizeEndpoint, type S3StorageOptions } from "./s3Storage.js";

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

describe("normalizeEndpoint", () => {
  it("prepends http:// to scheme-less internal endpoints", () => {
    expect(normalizeEndpoint("minio.railway.internal:9000")).toBe("http://minio.railway.internal:9000");
    expect(normalizeEndpoint("minio:9000")).toBe("http://minio:9000");
    expect(normalizeEndpoint("localhost:9000")).toBe("http://localhost:9000");
    expect(normalizeEndpoint("192.168.1.10:9000")).toBe("http://192.168.1.10:9000");
    expect(normalizeEndpoint("10.0.0.5:9000")).toBe("http://10.0.0.5:9000");
  });

  it("keeps scheme-qualified endpoints untouched", () => {
    expect(normalizeEndpoint("https://s3.eu-central-1.amazonaws.com")).toBe("https://s3.eu-central-1.amazonaws.com");
    expect(normalizeEndpoint("http://localhost:9000")).toBe("http://localhost:9000");
  });

  it("rejects scheme-less remote endpoints instead of downgrading to plaintext", () => {
    expect(() => normalizeEndpoint("s3.eu-central-1.amazonaws.com")).toThrow(/explicit scheme/);
    expect(() => normalizeEndpoint("backblaze.example.com:9000")).toThrow(/explicit scheme/);
  });

  it("passes undefined through", () => {
    expect(normalizeEndpoint(undefined)).toBeUndefined();
  });
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
