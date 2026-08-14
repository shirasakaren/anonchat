import { describe, expect, it } from "vitest";
import {
  isCompleteProfileMediaOrder,
  parseProfileMediaRange,
  profileMediaKindForMime,
  readProfileMediaBuffer,
  safeProfileMediaFilename,
} from "./profileMedia.service.js";

describe("profile media helpers", () => {
  it("classifies supported animated images and playable videos", () => {
    expect(profileMediaKindForMime("image/gif")).toBe("IMAGE");
    expect(profileMediaKindForMime("video/mp4")).toBe("VIDEO");
    expect(profileMediaKindForMime("video/webm")).toBe("VIDEO");
    expect(profileMediaKindForMime("application/octet-stream")).toBeNull();
  });

  it("removes uploaded path components from displayed filenames", () => {
    expect(safeProfileMediaFilename("C:\\fakepath\\clip.mp4")).toBe("clip.mp4");
    expect(safeProfileMediaFilename("../../portrait.gif")).toBe("portrait.gif");
  });

  it("parses open, closed, and suffix byte ranges", () => {
    expect(parseProfileMediaRange(undefined, 100)).toBeNull();
    expect(parseProfileMediaRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseProfileMediaRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseProfileMediaRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseProfileMediaRange("bytes=100-120", 100)).toBe("invalid");
    expect(parseProfileMediaRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseProfileMediaRange("bytes=0-1,5-6", 100)).toBe("invalid");
  });

  it("caps media while streaming instead of buffering past its category limit", async () => {
    async function* chunks() {
      yield Buffer.from("1234");
      yield Buffer.from("5678");
    }

    await expect(readProfileMediaBuffer(chunks(), 8, "too large")).resolves.toEqual(Buffer.from("12345678"));
    await expect(readProfileMediaBuffer(chunks(), 7, "too large")).rejects.toMatchObject({ statusCode: 413 });
  });

  it("accepts only complete media orders without duplicates", () => {
    expect(isCompleteProfileMediaOrder(["one", "two", "three"], ["three", "one", "two"])).toBe(true);
    expect(isCompleteProfileMediaOrder(["one", "two", "three"], ["one", "two"])).toBe(false);
    expect(isCompleteProfileMediaOrder(["one", "two", "three"], ["one", "two", "two"])).toBe(false);
    expect(isCompleteProfileMediaOrder(["one", "two", "three"], ["one", "two", "other"])).toBe(false);
  });
});
