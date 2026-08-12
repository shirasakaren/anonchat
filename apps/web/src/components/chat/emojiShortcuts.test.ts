import { describe, expect, it } from "vitest";
import { expandEmojiShortcuts } from "./emojiShortcuts.js";

describe("expandEmojiShortcuts", () => {
  it("expands a known shortcode", () => {
    expect(expandEmojiShortcuts("hello :sob:")).toBe("hello 😭");
  });

  it("expands multiple shortcodes in one string", () => {
    expect(expandEmojiShortcuts(":joy: and :fire:")).toBe("😂 and 🔥");
  });

  it("is case-insensitive", () => {
    expect(expandEmojiShortcuts(":SOB:")).toBe("😭");
  });

  it("leaves unknown shortcodes untouched", () => {
    expect(expandEmojiShortcuts("hello :not_a_real_emoji:")).toBe("hello :not_a_real_emoji:");
  });

  it("leaves text with no shortcodes untouched", () => {
    expect(expandEmojiShortcuts("just plain text")).toBe("just plain text");
  });

  it("handles the +1/-1 aliases", () => {
    expect(expandEmojiShortcuts(":+1: :-1:")).toBe("👍 👎");
  });
});
