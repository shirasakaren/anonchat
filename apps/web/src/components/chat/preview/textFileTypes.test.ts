import { describe, expect, it } from "vitest";
import {
  attachmentLimitCategory,
  detectTextLanguage,
  isCsv,
  maxAttachmentSizeMbForFile,
  resolveFileMimetype,
} from "./textFileTypes.js";

describe("detectTextLanguage", () => {
  it("maps known extensions to their language id", () => {
    expect(detectTextLanguage("application/octet-stream", "notes.ts")).toBe("typescript");
    expect(detectTextLanguage("application/octet-stream", "config.yaml")).toBe("yaml");
    expect(detectTextLanguage("application/octet-stream", "script.py")).toBe("python");
  });

  it("prefers extension over a generic mimetype", () => {
    expect(detectTextLanguage("text/plain", "server.js")).toBe("javascript");
  });

  it("falls back to plaintext for a generic text/* mimetype with an unknown extension", () => {
    expect(detectTextLanguage("text/plain", "readme.xyz")).toBe("plaintext");
  });

  it("does not treat csv as a generic text preview - it has its own component", () => {
    expect(detectTextLanguage("text/csv", "data.csv")).toBeNull();
  });

  it("returns null for binary/unrecognized types", () => {
    expect(detectTextLanguage("image/png", "photo.png")).toBeNull();
    expect(detectTextLanguage("application/octet-stream", "archive.zip")).toBeNull();
  });

  it("recognizes common application/* text-like mimetypes even with no extension", () => {
    expect(detectTextLanguage("application/json", "blob")).toBe("plaintext");
  });

  it("keeps misleading text MIME metadata from previewing known binary files", () => {
    expect(detectTextLanguage("text/plain", "program.exe")).toBeNull();
    expect(detectTextLanguage("text/plain", "archive.bin")).toBeNull();
  });
});

describe("isCsv", () => {
  it("recognizes the standard text/csv mimetype", () => {
    expect(isCsv("text/csv", "anything")).toBe(true);
  });

  it("recognizes a .csv extension even under a generic mimetype", () => {
    expect(isCsv("application/vnd.ms-excel", "export.csv")).toBe(true);
  });

  it("rejects non-csv files", () => {
    expect(isCsv("text/plain", "notes.txt")).toBe(false);
  });
});

describe("resolveFileMimetype", () => {
  it("infers previewable formats when browser metadata is missing or generic", () => {
    expect(resolveFileMimetype("application/octet-stream", "animation.svg")).toBe("image/svg+xml");
    expect(resolveFileMimetype("", "clip.mov")).toBe("video/quicktime");
    expect(resolveFileMimetype("application/octet-stream", "component.jsx")).toBe("text/plain");
  });

  it("preserves specific MIME metadata for unknown extensions", () => {
    expect(resolveFileMimetype("application/zip", "backup.custom")).toBe("application/zip");
    expect(resolveFileMimetype("", "backup.zip")).toBe("application/octet-stream");
  });
});

describe("attachment upload categories", () => {
  it("classifies previewable and fallback files", () => {
    expect(attachmentLimitCategory("", "photo.svg")).toBe("image");
    expect(attachmentLimitCategory("", "recording.mov")).toBe("video");
    expect(attachmentLimitCategory("audio/mpeg", "recording.bin")).toBe("audio");
    expect(attachmentLimitCategory("application/octet-stream", "component.jsx")).toBe("document");
    expect(attachmentLimitCategory("application/zip", "archive.zip")).toBe("other");
  });

  it("uses the lower of the global and category limits", () => {
    const limits = { globalMb: 80, imageMb: 20, videoMb: 100, audioMb: 30, documentMb: 50, otherMb: 25 };
    expect(maxAttachmentSizeMbForFile(limits, "image/png", "photo.png")).toEqual({
      category: "image",
      limitMb: 20,
    });
    expect(maxAttachmentSizeMbForFile(limits, "video/mp4", "clip.mp4")).toEqual({
      category: "video",
      limitMb: 80,
    });
  });
});
