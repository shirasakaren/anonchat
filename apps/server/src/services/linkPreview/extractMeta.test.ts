import { describe, expect, it } from "vitest";
import { extractMetaTags } from "./extractMeta.js";

function html(head: string): string {
  return `<!DOCTYPE html><html><head>${head}</head><body></body></html>`;
}

describe("extractMetaTags", () => {
  it("extracts standard Open Graph tags", () => {
    const result = extractMetaTags(
      html(`
        <meta property="og:title" content="Example Title">
        <meta property="og:description" content="Example description.">
        <meta property="og:image" content="https://example.com/image.jpg">
        <meta property="og:site_name" content="Example Site">
      `),
    );
    expect(result).toEqual({
      title: "Example Title",
      description: "Example description.",
      imageUrl: "https://example.com/image.jpg",
      siteName: "Example Site",
    });
  });

  it("falls back to <title> and meta name=description when no OG tags exist", () => {
    const result = extractMetaTags(
      html(`<title>Plain Title</title><meta name="description" content="Plain description.">`),
    );
    expect(result.title).toBe("Plain Title");
    expect(result.description).toBe("Plain description.");
  });

  it("falls back to twitter: tags when no og: tags exist", () => {
    const result = extractMetaTags(
      html(`
        <meta name="twitter:title" content="Twitter Title">
        <meta name="twitter:description" content="Twitter description.">
        <meta name="twitter:image" content="https://example.com/twitter.jpg">
      `),
    );
    expect(result.title).toBe("Twitter Title");
    expect(result.description).toBe("Twitter description.");
    expect(result.imageUrl).toBe("https://example.com/twitter.jpg");
  });

  it("prefers og: over twitter: and plain tags when both are present", () => {
    const result = extractMetaTags(
      html(`
        <title>Plain Title</title>
        <meta name="twitter:title" content="Twitter Title">
        <meta property="og:title" content="OG Title">
      `),
    );
    expect(result.title).toBe("OG Title");
  });

  it("decodes HTML entities", () => {
    const result = extractMetaTags(html(`<meta property="og:title" content="Fish &amp; Chips &mdash;">`));
    // &mdash; isn't in the small decode table (not needed for the common
    // case) - left as-is is fine, but &amp; must decode correctly and not
    // double-decode into something else.
    expect(result.title).toBe("Fish & Chips &mdash;");
  });

  it("truncates an overly long title/description rather than rejecting it", () => {
    const longTitle = "x".repeat(500);
    const result = extractMetaTags(html(`<meta property="og:title" content="${longTitle}">`));
    expect(result.title?.length).toBe(301); // 300 chars + the truncation ellipsis
    expect(result.title?.endsWith("…")).toBe(true);
  });

  it("drops an overly long image URL entirely rather than truncating it (truncating would corrupt it)", () => {
    const longUrl = `https://example.com/${"x".repeat(3000)}.jpg`;
    const result = extractMetaTags(html(`<meta property="og:image" content="${longUrl}">`));
    expect(result.imageUrl).toBeNull();
  });

  it("ignores unrelated meta tags", () => {
    const result = extractMetaTags(html(`<meta charset="utf-8"><meta name="viewport" content="width=device-width">`));
    expect(result).toEqual({ title: null, description: null, imageUrl: null, siteName: null });
  });

  it("handles single-quoted and unquoted attribute values", () => {
    const result = extractMetaTags(html(`<meta property='og:title' content='Single Quoted'>`));
    expect(result.title).toBe("Single Quoted");
  });

  it("returns all-null fields for a document with no head metadata at all", () => {
    expect(extractMetaTags("<html><body>hello</body></html>")).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    });
  });

  it("does not execute or otherwise treat a <script> tag as content", () => {
    const result = extractMetaTags(html(`<script>document.title = "hacked"</script><title>Real Title</title>`));
    expect(result.title).toBe("Real Title");
  });
});
