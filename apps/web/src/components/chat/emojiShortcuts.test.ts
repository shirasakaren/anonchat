import { describe, expect, it } from "vitest";
import {
  expandEmojiShortcuts,
  findActiveShortcodeQuery,
  listShortcodes,
  matchCompletedShortcode,
  searchShortcodes,
} from "./emojiShortcuts.js";

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

  it("expands a shortcode reachable only through the full generated dataset, not a curated alias", () => {
    // Not one of the hand-picked short aliases - only reachable because
    // every emoji in the dataset gets its own slug-derived shortcode.
    expect(expandEmojiShortcuts(":unicorn:")).toBe("🦄");
  });
});

describe("searchShortcodes", () => {
  it("matches by prefix", () => {
    expect(searchShortcodes("thinking")).toContainEqual({ code: "thinking", emoji: "🤔" });
  });

  it("is case-insensitive", () => {
    expect(searchShortcodes("JOY")).toContainEqual({ code: "joy", emoji: "😂" });
  });

  it("returns nothing for an empty query", () => {
    expect(searchShortcodes("")).toEqual([]);
  });

  it("returns nothing for a query with no matches", () => {
    expect(searchShortcodes("zzzzznotreal")).toEqual([]);
  });

  it("caps the result list", () => {
    expect(searchShortcodes("s", 3).length).toBe(3);
  });

  it("sorts shorter/closer matches first", () => {
    const results = searchShortcodes("so", 5);
    expect(results[0]).toEqual({ code: "sob", emoji: "😭" });
  });

  // The motivating example: a short, common word like "sad" needs to be
  // reachable even though no emoji's own dataset slug is literally "sad" -
  // this only works because CURATED_ALIASES layers "sad" on top of the
  // generated slug map.
  it('finds both "sad" and "sunglasses" for a short prefix, WhatsApp-style', () => {
    const short = searchShortcodes("s", 3);
    expect(short.map((m) => m.code)).toContain("sad");

    const longer = searchShortcodes("sun", 5);
    expect(longer.map((m) => m.code)).toContain("sunglasses");
  });
});

describe("listShortcodes", () => {
  it("includes far more than the old hand-picked list - the full dataset", () => {
    // ~1900 emoji, plus curated aliases that don't collide with their own
    // slug - comfortably more than the ~30 this used to be capped at.
    expect(listShortcodes().length).toBeGreaterThan(1900);
  });
});

describe("findActiveShortcodeQuery", () => {
  it("finds a partial shortcode at the end of text", () => {
    expect(findActiveShortcodeQuery("hello :so")).toEqual({ start: 6, query: "so" });
  });

  it("finds one at the very start of the text", () => {
    expect(findActiveShortcodeQuery(":joy")).toEqual({ start: 0, query: "joy" });
  });

  it("ignores a colon in the middle of a word", () => {
    expect(findActiveShortcodeQuery("see you at 10:30")).toBeNull();
  });

  it("ignores plain text with no colon", () => {
    expect(findActiveShortcodeQuery("no emoji here")).toBeNull();
  });

  it("returns an empty query for a bare trailing colon", () => {
    expect(findActiveShortcodeQuery("hello :")).toEqual({ start: 6, query: "" });
  });
});

describe("matchCompletedShortcode", () => {
  it("matches a completed known shortcode", () => {
    expect(matchCompletedShortcode("hi :sob:")).toEqual({ start: 3, end: 8, emoji: "😭" });
  });

  it("is case-insensitive", () => {
    expect(matchCompletedShortcode(":SOB:")).toEqual({ start: 0, end: 5, emoji: "😭" });
  });

  it("does not match unknown shortcodes", () => {
    expect(matchCompletedShortcode("hi :nope:")).toBeNull();
  });

  it("does not match a partial shortcode", () => {
    expect(matchCompletedShortcode("hi :so")).toBeNull();
  });
});
