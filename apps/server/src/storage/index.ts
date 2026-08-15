import { loadEnv } from "../env.js";
import { LocalStorageAdapter } from "./localStorage.js";
import { S3StorageAdapter } from "./s3Storage.js";
import type { StorageAdapter } from "./types.js";

export type { StorageAdapter } from "./types.js";

let cached: StorageAdapter | undefined;

export function getStorageAdapter(): StorageAdapter {
  if (cached) return cached;
  const env = loadEnv();
  // S3_ENDPOINT alone selects the s3 driver: platform templates express
  // object-storage wiring as reference variables and can't carry a separate
  // STORAGE_DRIVER flag (see env.ts).
  const useS3 = env.STORAGE_DRIVER === "s3" || !!env.S3_ENDPOINT;
  if (useS3) {
    cached = new S3StorageAdapter({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  } else {
    cached = new LocalStorageAdapter(env.UPLOAD_DIR);
  }
  return cached;
}
