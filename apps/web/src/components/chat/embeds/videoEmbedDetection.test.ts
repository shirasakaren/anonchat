import { describe, expect, it } from "vitest";
import { detectVideoEmbed } from "./videoEmbedDetection.js";

describe("detectVideoEmbed - YouTube", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["http://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("matches %s", (url, expectedId) => {
    const result = detectVideoEmbed(url);
    expect(result?.platform).toBe("youtube");
    expect(result?.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${expectedId}`);
  });

  it("does not match a channel URL with no video id", () => {
    expect(detectVideoEmbed("https://www.youtube.com/@somechannel")).toBeNull();
  });
});

describe("detectVideoEmbed - Vimeo", () => {
  it.each(["https://vimeo.com/76979871", "https://www.vimeo.com/76979871", "http://vimeo.com/76979871"])(
    "matches %s",
    (url) => {
      const result = detectVideoEmbed(url);
      expect(result?.platform).toBe("vimeo");
      expect(result?.embedUrl).toBe("https://player.vimeo.com/video/76979871");
    },
  );
});

describe("detectVideoEmbed - non-matches", () => {
  it.each(["https://example.com", "https://tiktok.com/@user/video/123", "https://x.com/user/status/123", "not a url"])(
    "returns null for %s",
    (url) => {
      expect(detectVideoEmbed(url)).toBeNull();
    },
  );
});
