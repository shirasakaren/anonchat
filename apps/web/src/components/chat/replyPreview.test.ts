// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { encryptAttachmentMeta } from "../../crypto/conversationCrypto.js";
import { REPLY_PREVIEW_MAX_CHARS, buildReplyPreviewInfo } from "./replyPreview.js";
import type { DisplayMessage } from "./types.js";

// A valid 32-byte key (XChaCha20-Poly1305) - contents don't matter here.
const KEY = new Uint8Array(32).fill(7);

function baseMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: "m1",
    senderType: "USER",
    text: "",
    replyToId: null,
    attachments: [],
    reactions: [],
    edited: false,
    deleted: false,
    createdAt: "2026-08-16T10:00:00.000Z",
    readAt: null,
    status: "sent",
    ...overrides,
  };
}

describe("buildReplyPreviewInfo", () => {
  it("returns empty for a missing message", () => {
    expect(buildReplyPreviewInfo(undefined, KEY)).toEqual({ kind: "empty", text: "" });
  });

  it("labels a deleted message", () => {
    expect(buildReplyPreviewInfo(baseMessage({ deleted: true }), KEY)).toEqual({
      kind: "deleted",
      text: "Message deleted",
    });
  });

  it("truncates a very long text to a single compact line", () => {
    const long = "word ".repeat(10_000);
    const info = buildReplyPreviewInfo(baseMessage({ text: long }), KEY);
    expect(info.kind).toBe("text");
    expect(info.text.length).toBeLessThanOrEqual(REPLY_PREVIEW_MAX_CHARS);
    expect(info.text.endsWith("…")).toBe(true);
    expect(info.text).not.toContain("\n");
  });

  it("collapses newlines into a single line", () => {
    const info = buildReplyPreviewInfo(baseMessage({ text: "line one\n\nline two" }), KEY);
    expect(info.text).toBe("line one line two");
  });

  it("builds a photo label for an attachment-only image message", () => {
    const meta = encryptAttachmentMeta(KEY, { filename: "cat.jpg", mimetype: "image/jpeg", size: 10 });
    const message = baseMessage({
      attachments: [{ id: "a1", meta, sizeBytes: 10, createdAt: "2026-08-16T10:00:00.000Z" }],
    });
    expect(buildReplyPreviewInfo(message, KEY)).toEqual({
      kind: "attachment",
      text: "Photo · cat.jpg",
    });
  });

  it("builds a video label for an attachment-only video message", () => {
    const meta = encryptAttachmentMeta(KEY, { filename: "clip.mp4", mimetype: "video/mp4", size: 10 });
    const message = baseMessage({
      attachments: [{ id: "a1", meta, sizeBytes: 10, createdAt: "2026-08-16T10:00:00.000Z" }],
    });
    expect(buildReplyPreviewInfo(message, KEY)).toEqual({
      kind: "attachment",
      text: "Video · clip.mp4",
    });
  });

  it("prefers the caption over the attachment when both exist", () => {
    const meta = encryptAttachmentMeta(KEY, { filename: "cat.jpg", mimetype: "image/jpeg", size: 10 });
    const message = baseMessage({
      text: "look at this cat",
      attachments: [{ id: "a1", meta, sizeBytes: 10, createdAt: "2026-08-16T10:00:00.000Z" }],
    });
    expect(buildReplyPreviewInfo(message, KEY)).toEqual({ kind: "text", text: "look at this cat" });
  });
});
