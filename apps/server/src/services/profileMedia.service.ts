import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import type { ProfileMedia, ProfileMediaKind } from "@prisma/client";
import type { ProfileMediaDto } from "@anonchat/shared";
import { prisma } from "../db.js";
import { getStorageAdapter } from "../storage/index.js";
import { Errors } from "../utils/errors.js";

export const MAX_PROFILE_MEDIA_ITEMS = 8;

export const PROFILE_MEDIA_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

export function profileMediaKindForMime(mimetype: string): ProfileMediaKind | null {
  if (!PROFILE_MEDIA_MIME_TYPES.has(mimetype)) return null;
  return mimetype.startsWith("video/") ? "VIDEO" : "IMAGE";
}

export function safeProfileMediaFilename(filename: string): string {
  const normalized = basename(filename.replaceAll("\\", "/")).trim();
  return (normalized || "profile-media").slice(0, 200);
}

export async function readProfileMediaBuffer(
  stream: AsyncIterable<Buffer>,
  maxBytes: number,
  tooLargeMessage: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.byteLength;
    if (total > maxBytes) throw Errors.tooLarge(tooLargeMessage);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

export function toProfileMediaDto(media: ProfileMedia): ProfileMediaDto {
  return {
    id: media.id,
    kind: media.kind === "VIDEO" ? "video" : "image",
    mimetype: media.mimetype,
    filename: media.filename,
    sizeBytes: media.sizeBytes,
    url: `/api/site/media/${encodeURIComponent(media.id)}`,
  };
}

export async function listProfileMedia(): Promise<ProfileMediaDto[]> {
  const media = await prisma.profileMedia.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return media.map(toProfileMediaDto);
}

export async function addProfileMedia(params: {
  kind: ProfileMediaKind;
  mimetype: string;
  filename: string;
  buffer: Buffer;
}): Promise<ProfileMedia> {
  const existing = await prisma.profileMedia.findMany({ select: { position: true }, orderBy: { position: "desc" } });
  if (existing.length >= MAX_PROFILE_MEDIA_ITEMS) {
    throw Errors.badRequest(`You can add up to ${MAX_PROFILE_MEDIA_ITEMS} profile media items.`);
  }

  const storage = getStorageAdapter();
  const storageKey = `profile-media/${randomBytes(24).toString("hex")}`;
  await storage.put(storageKey, params.buffer);
  try {
    return await prisma.profileMedia.create({
      data: {
        kind: params.kind,
        mimetype: params.mimetype,
        filename: safeProfileMediaFilename(params.filename),
        sizeBytes: params.buffer.byteLength,
        storageKey,
        position: (existing[0]?.position ?? -1) + 1,
      },
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function removeProfileMedia(id: string): Promise<{ storageCleanupFailed: boolean }> {
  const media = await prisma.profileMedia.findUnique({ where: { id } });
  if (!media) throw Errors.notFound("Profile media not found.");
  await prisma.profileMedia.delete({ where: { id } });
  if (!media.storageKey) return { storageCleanupFailed: false };
  const storageCleanupFailed = await getStorageAdapter()
    .delete(media.storageKey)
    .then(() => false)
    .catch(() => true);
  return { storageCleanupFailed };
}

export async function getProfileMediaBytes(id: string): Promise<{ media: ProfileMedia; buffer: Buffer }> {
  const media = await prisma.profileMedia.findUnique({ where: { id } });
  if (!media) throw Errors.notFound("Profile media not found.");

  if (media.storageKey) {
    return { media, buffer: await getStorageAdapter().get(media.storageKey) };
  }
  if (media.inlineDataUrl) {
    const match = /^data:[^;,]+;base64,([a-zA-Z0-9+/=\s]+)$/.exec(media.inlineDataUrl);
    if (match?.[1]) return { media, buffer: Buffer.from(match[1], "base64") };
  }
  throw Errors.notFound("Profile media content is unavailable.");
}

export interface ByteRange {
  start: number;
  end: number;
}

/** Parses one RFC 7233 byte range. Multiple ranges are deliberately rejected
 * because profile media playback only needs a single seek window. */
export function parseProfileMediaRange(header: string | undefined, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return "invalid";
  const [, startText, endText] = match;
  if (!startText && !endText) return "invalid";

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size) {
    return "invalid";
  }
  const end = Math.min(requestedEnd, size - 1);
  if (end < start) return "invalid";
  return { start, end };
}
