import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
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

/**
 * True for hosts that are only reachable on a private network: loopback,
 * RFC 1918/ULA/link-local addresses, mDNS-style names, and bare service
 * aliases (docker compose, Kubernetes, Railway private networking).
 */
function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "internal" || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (!h.includes(".")) return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    );
  }
  if (h.includes(":")) {
    // IPv6: loopback ::1, ULA fc00::/7, link-local fe80::/10
    return h === "::1" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  return false;
}

/**
 * Ensures the endpoint carries a scheme. Scheme-less endpoints are accepted
 * only for internal hosts (MinIO on a private network and the like), where
 * plain HTTP is the norm; remote hosts must state their scheme explicitly so
 * a TLS-capable endpoint can never be silently downgraded to plaintext.
 */
export function normalizeEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) return endpoint;
  if (endpoint.includes("://")) return endpoint;
  let hostname: string;
  try {
    hostname = new URL(`http://${endpoint}`).hostname;
  } catch {
    throw new Error(`S3_ENDPOINT "${endpoint}" is not a valid host:port endpoint`);
  }
  if (!isInternalHost(hostname)) {
    throw new Error(
      `S3_ENDPOINT "${endpoint}" must include an explicit scheme (http:// or https://) for non-internal hosts`,
    );
  }
  return `http://${endpoint}`;
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

  async putStream(key: string, stream: Readable): Promise<void> {
    await this.ensureReady();
    // The lib-storage Upload helper streams the body over the wire (with
    // multipart uploads for larger objects) - a plain PutObjectCommand
    // with an unknown-length stream would buffer the whole object in
    // memory to compute its length, defeating the point of putStream.
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: "application/octet-stream",
      },
    }).done();
  }

  async getStream(key: string): Promise<Readable> {
    await this.ensureReady();
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return result.Body as Readable;
  }

  async stat(key: string): Promise<{ size: number } | null> {
    await this.ensureReady();
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: result.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureReady();
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
