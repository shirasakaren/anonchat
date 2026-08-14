import { describe, expect, it } from "vitest";
import { isAdminSessionActive } from "./session.js";

const now = new Date("2026-08-14T10:00:00.000Z");

describe("admin session expiry", () => {
  it("accepts a live, non-revoked session", () => {
    expect(isAdminSessionActive({ revokedAt: null, expiresAt: new Date("2026-08-15T10:00:00.000Z") }, now)).toBe(true);
  });

  it("rejects expired and exactly-expiring sessions", () => {
    expect(isAdminSessionActive({ revokedAt: null, expiresAt: new Date("2026-08-14T09:59:59.000Z") }, now)).toBe(false);
    expect(isAdminSessionActive({ revokedAt: null, expiresAt: now }, now)).toBe(false);
  });

  it("rejects a revoked session even before expiry", () => {
    expect(
      isAdminSessionActive(
        { revokedAt: new Date("2026-08-13T10:00:00.000Z"), expiresAt: new Date("2026-09-14T10:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });
});
