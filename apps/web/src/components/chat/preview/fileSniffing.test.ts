import { describe, expect, it } from "vitest";
import { hasSpoofedMediaClaim, resolveFileMimetypeWithBytes } from "./fileSniffing.js";

function zipHead(): Uint8Array {
  // PK\x03\x04 followed by padding
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

function pngHead(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
}

describe("resolveFileMimetypeWithBytes", () => {
  it("downgrades a .zip renamed to .mp4 to application/zip", () => {
    expect(resolveFileMimetypeWithBytes("video/mp4", "movie.mp4", zipHead())).toBe("application/zip");
  });

  it("downgrades a .zip renamed to .jpg to application/zip", () => {
    expect(resolveFileMimetypeWithBytes("image/jpeg", "photo.jpg", zipHead())).toBe("application/zip");
  });

  it("keeps a genuine docx (a zip container) as docx", () => {
    expect(
      resolveFileMimetypeWithBytes(
        "application/octet-stream",
        "report.docx",
        zipHead(),
      ),
    ).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("keeps a genuine image claim when the bytes agree", () => {
    expect(resolveFileMimetypeWithBytes("image/png", "photo.png", pngHead())).toBe("image/png");
  });

  it("upgrades a real image renamed to .zip to its sniffed type", () => {
    expect(resolveFileMimetypeWithBytes("application/zip", "photo.zip", pngHead())).toBe("image/png");
  });
});

describe("hasSpoofedMediaClaim", () => {
  it("flags a zip posing as a video", () => {
    const spoofed = hasSpoofedMediaClaim("video/mp4", "movie.mp4", zipHead());
    expect(spoofed).toEqual({ claimed: "video/mp4", actual: "application/zip" });
  });

  it("returns null when the claim matches the bytes", () => {
    expect(hasSpoofedMediaClaim("image/png", "photo.png", pngHead())).toBeNull();
  });
});
