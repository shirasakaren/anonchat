import { describe, expect, it } from "vitest";
import { extractUrls } from "./urlExtraction.js";

describe("extractUrls", () => {
  it("extracts a single URL", () => {
    expect(extractUrls("check this out: https://example.com/page", 3)).toEqual(["https://example.com/page"]);
  });

  it("extracts multiple URLs in order", () => {
    expect(extractUrls("https://a.com and https://b.com", 3)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("caps at maxCount", () => {
    expect(extractUrls("https://a.com https://b.com https://c.com", 2)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("deduplicates the same URL mentioned twice", () => {
    expect(extractUrls("https://a.com again: https://a.com", 5)).toEqual(["https://a.com"]);
  });

  it("returns an empty array for text with no URLs", () => {
    expect(extractUrls("just some plain text", 3)).toEqual([]);
  });

  it("does not match a URL inside markdown parens (already-linked text)", () => {
    // The trailing ")" is excluded from the match, matching linkify()'s own behavior.
    expect(extractUrls("[label](https://example.com)", 3)).toEqual(["https://example.com"]);
  });
});
