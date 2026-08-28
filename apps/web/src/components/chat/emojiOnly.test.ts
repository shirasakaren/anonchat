import { describe, expect, it } from "vitest";
import { getEmojiOnlyDisplay } from "./emojiOnly.js";

describe("getEmojiOnlyDisplay", () => {
  it("sizes a single emoji at the largest step", () => {
    expect(getEmojiOnlyDisplay("😀")).toEqual({ count: 1, sizeClass: "text-6xl" });
  });

  it("steps the size down as the emoji count grows", () => {
    expect(getEmojiOnlyDisplay("😀😀")?.sizeClass).toBe("text-5xl");
    expect(getEmojiOnlyDisplay("😀😀😀")?.sizeClass).toBe("text-4xl");
    expect(getEmojiOnlyDisplay("😀😀😀😀")?.sizeClass).toBe("text-3xl");
    expect(getEmojiOnlyDisplay("😀😀😀😀😀")?.sizeClass).toBe("text-2xl");
  });

  it("falls back to the normal pipeline once there are too many emoji to size up", () => {
    expect(getEmojiOnlyDisplay("😀😀😀😀😀😀")).toBeNull();
  });

  it("ignores whitespace between emoji without counting it as non-emoji", () => {
    expect(getEmojiOnlyDisplay("😀 😀  😀")).toEqual({ count: 3, sizeClass: "text-4xl" });
  });

  it("counts a flag (a pair of regional indicators) as a single emoji", () => {
    expect(getEmojiOnlyDisplay("🇯🇵")).toEqual({ count: 1, sizeClass: "text-6xl" });
  });

  it("counts a skin-tone-modified emoji as a single emoji", () => {
    expect(getEmojiOnlyDisplay("👍🏽")).toEqual({ count: 1, sizeClass: "text-6xl" });
  });

  it("counts a ZWJ family sequence as a single emoji", () => {
    expect(getEmojiOnlyDisplay("👨‍👩‍👧‍👦")).toEqual({ count: 1, sizeClass: "text-6xl" });
  });

  it("returns null for plain text", () => {
    expect(getEmojiOnlyDisplay("hello")).toBeNull();
  });

  it("returns null when emoji are mixed with text", () => {
    expect(getEmojiOnlyDisplay("😀 hello")).toBeNull();
  });

  it("returns null for empty or whitespace-only text", () => {
    expect(getEmojiOnlyDisplay("")).toBeNull();
    expect(getEmojiOnlyDisplay("   ")).toBeNull();
  });

  it("returns null when emoji are mixed with punctuation", () => {
    expect(getEmojiOnlyDisplay("😀!")).toBeNull();
  });
});
