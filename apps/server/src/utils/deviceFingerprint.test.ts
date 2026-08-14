import { describe, expect, it } from "vitest";
import { deviceFingerprint } from "./deviceFingerprint.js";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CHROME_MAC_NEWER_VERSION =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.5.1234.56 Safari/537.36";
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Gecko/20100101 Firefox/121.0";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("deviceFingerprint", () => {
  it("treats a browser version bump as the same device", () => {
    expect(deviceFingerprint("1.2.3.4", CHROME_MAC)).toBe(deviceFingerprint("1.2.3.4", CHROME_MAC_NEWER_VERSION));
  });

  it("treats a different browser on the same OS/IP as a different device", () => {
    expect(deviceFingerprint("1.2.3.4", CHROME_MAC)).not.toBe(deviceFingerprint("1.2.3.4", FIREFOX_MAC));
  });

  it("treats the same browser from a different IP as a different device", () => {
    expect(deviceFingerprint("1.2.3.4", CHROME_MAC)).not.toBe(deviceFingerprint("5.6.7.8", CHROME_MAC));
  });

  it("distinguishes phone from desktop even if both ran Safari on 'Mac OS X'", () => {
    expect(deviceFingerprint("1.2.3.4", SAFARI_IOS)).not.toBe(
      deviceFingerprint("1.2.3.4", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15 Version/17.0"),
    );
  });

  it("returns null (declines to dedupe) when the IP is missing", () => {
    expect(deviceFingerprint(null, CHROME_MAC)).toBeNull();
  });

  it("returns null when the User-Agent is missing", () => {
    expect(deviceFingerprint("1.2.3.4", null)).toBeNull();
  });

  it("returns null for an unparseable User-Agent rather than lumping unknowns together", () => {
    expect(deviceFingerprint("1.2.3.4", "SomeBotOrCliTool/1.0")).toBeNull();
  });
});
