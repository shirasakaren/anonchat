import { describe, expect, it } from "vitest";
import { isDigestDue } from "./notificationDigest.service.js";

describe("isDigestDue", () => {
  it("is not due before the interval has elapsed", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    const lastSent = new Date("2026-01-01T00:00:00Z");
    expect(isDigestDue(lastSent, 15, now)).toBe(false);
  });

  it("is due exactly at the interval boundary", () => {
    const now = Date.parse("2026-01-01T00:15:00Z");
    const lastSent = new Date("2026-01-01T00:00:00Z");
    expect(isDigestDue(lastSent, 15, now)).toBe(true);
  });

  it("is due well past the interval", () => {
    const now = Date.parse("2026-01-01T01:00:00Z");
    const lastSent = new Date("2026-01-01T00:00:00Z");
    expect(isDigestDue(lastSent, 15, now)).toBe(true);
  });
});
