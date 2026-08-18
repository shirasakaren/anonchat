import { describe, expect, it } from "vitest";
import { isAllowedGifMediaUrl } from "./gifSearch.service.js";

describe("isAllowedGifMediaUrl", () => {
  it.each([
    "https://media.giphy.com/media/abc/giphy.gif",
    "https://media0.giphy.com/media/abc/giphy.gif",
    "https://media9.giphy.com/media/abc/giphy.gif",
    "https://media.klipy.com/media/abc.gif",
  ])("allows %s", (url) => {
    expect(isAllowedGifMediaUrl(url)).toBe(true);
  });

  it.each([
    "http://media.giphy.com/media/abc/giphy.gif", // not https
    "https://giphy.com/media/abc/giphy.gif", // page host, not the media CDN
    "https://media.giphy.com.evil.example/media/abc/giphy.gif",
    "https://evil.example/giphy.gif",
    "javascript:alert(1)",
    "not a url",
    "https://media.klipy.com.evil.example/x.gif",
  ])("rejects %s", (url) => {
    expect(isAllowedGifMediaUrl(url)).toBe(false);
  });
});
