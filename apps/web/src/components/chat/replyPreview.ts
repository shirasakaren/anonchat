import { decryptAttachmentMeta } from "../../crypto/conversationCrypto.js";
import type { DisplayMessage } from "./types.js";

/** Reply previews render in a compact single-line chip - long messages and
 *  long filenames must be clamped here, not by CSS alone, so the chip can
 *  never grow into a wall that covers the thread (a very long reply target
 *  used to do exactly that). */
export const REPLY_PREVIEW_MAX_CHARS = 140;

export interface ReplyPreviewInfo {
  /** Single-line display text, already truncated. */
  text: string;
  kind: "text" | "attachment" | "deleted" | "empty";
}

function truncateSingleLine(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= REPLY_PREVIEW_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, REPLY_PREVIEW_MAX_CHARS - 1)}…`;
}

/** Human label for an attachment-only reply target, e.g. "Video · beach.mp4".
 *  The mimetype lives inside the encrypted attachment meta, so it must be
 *  decrypted with the conversation key first. */
function attachmentLabel(meta: { mimetype: string; filename: string }): string {
  if (meta.mimetype === "image/gif") return `GIF · ${meta.filename}`;
  if (meta.mimetype.startsWith("image/")) return `Photo · ${meta.filename}`;
  if (meta.mimetype.startsWith("video/")) return `Video · ${meta.filename}`;
  if (meta.mimetype.startsWith("audio/")) return `Audio · ${meta.filename}`;
  return meta.filename || "File";
}

/**
 * Builds the compact preview shown above the composer while replying and
 * above a message bubble when it quotes another message. Attachment-only
 * messages (no caption) still produce a real preview - "Photo · cat.jpg" -
 * so replying to a bare image/video/file is visible instead of silently
 * losing its reply context.
 */
export function buildReplyPreviewInfo(
  message: DisplayMessage | undefined,
  conversationKey: Uint8Array,
): ReplyPreviewInfo {
  if (!message) return { kind: "empty", text: "" };
  if (message.deleted) return { kind: "deleted", text: "Message deleted" };

  const text = message.text.trim();
  if (text) return { kind: "text", text: truncateSingleLine(text) };

  const first = message.attachments[0];
  if (first) {
    const meta = decryptAttachmentMeta(conversationKey, first.meta);
    const label = meta ? attachmentLabel(meta) : "File";
    return { kind: "attachment", text: truncateSingleLine(label) };
  }

  return { kind: "empty", text: "" };
}
