import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./types.js";

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

interface S3ErrorLike {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}

/** Ensures the endpoint carries a scheme; S3-compatible endpoints are plain HTTP. */
export function normalizeEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) return endpoint;
  return endpoint.includes("://") ? endpoint : `http://${endpoint}`;
}

/** True when a bucket lookup failed because the bucket does not exist. */
function isNotFound(err: unknown): boolean {
  const e = err as S3ErrorLike;
  return e?.name === "NotFound" || e?.name === "NoSuchBucket" || e?.$metadata?.httpStatusCode === 404;
}

/** True when a create raced another client and the bucket already exists. */
function isAlreadyOwned(err: unknown): boolean {
  const e = err as S3ErrorLike;
  return (
    e?.name === "BucketAlreadyOwnedByYou" || e?.name === "BucketAlreadyExists" || e?.$metadata?.httpStatusCode === 409
  );
}

/**
 * Works unmodified against AWS S3, Cloudflare R2, Backblaze B2, or MinIO.
 * The bucket is created lazily before the first operation, so pointing this
 * adapter at an empty MinIO or a fresh bucket name just works.
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private ready?: Promise<void>;

  constructor(options: S3StorageOptions, client?: S3Client) {
    this.bucket = options.bucket;
    this.client =
      client ??
      new S3Client({
        region: options.region,
        // The SDK requires a scheme. Endpoints may arrive scheme-less (for
        // example "minio.railway.internal:9000") because some PaaS runtimes
        // rewrite only scheme-qualified http:// URLs, so platform templates
        // deliberately omit the scheme.
        endpoint: normalizeEndpoint(options.endpoint),
        forcePathStyle: options.forcePathStyle,
        credentials: {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        },
      });
  }

  /** Shared by every operation so concurrent first writes race the create once. */
  private ensureReady(): Promise<void> {
    return (this.ready ??= this.ensureBucket());
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (createErr) {
        // Another replica (or a previous crashed start) won the race.
        if (!isAlreadyOwned(createErr)) throw createErr;
      }
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.ensureReady();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    await this.ensureReady();
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.ensureReady();
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
