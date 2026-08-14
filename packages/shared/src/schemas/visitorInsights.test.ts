import { describe, expect, it } from "vitest";
import { VisitorInsightConsentRequestSchema } from "./visitorInsights.js";

const VALID = {
  consented: true as const,
  userAgent: "Example Browser",
  browserName: "Example",
  browserVersion: "1",
  osName: "Example OS",
  osVersion: "1",
  deviceType: "desktop" as const,
  platform: "Example",
  language: "en-US",
  languages: ["en-US", "en"],
  timezone: "Asia/Jakarta",
  screenWidth: 1440,
  screenHeight: 900,
  viewportWidth: 1200,
  viewportHeight: 780,
  pixelRatio: 2,
  colorDepth: 24,
  touchPoints: 0,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  connectionType: "wifi",
  connectionEffectiveType: "4g",
  connectionDownlinkMbps: 10,
  connectionRttMs: 50,
  connectionSaveData: false,
  referrerOrigin: "https://example.com",
};

describe("VisitorInsightConsentRequestSchema", () => {
  it("accepts a bounded consented browser snapshot", () => {
    expect(VisitorInsightConsentRequestSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires affirmative consent", () => {
    expect(VisitorInsightConsentRequestSchema.safeParse({ ...VALID, consented: false }).success).toBe(false);
  });

  it("rejects fingerprint-like extra fields", () => {
    expect(VisitorInsightConsentRequestSchema.safeParse({ ...VALID, canvasHash: "abc" }).success).toBe(false);
  });

  it("caps dimensions and collection cardinality", () => {
    expect(VisitorInsightConsentRequestSchema.safeParse({ ...VALID, screenWidth: 1_000_000 }).success).toBe(false);
    expect(
      VisitorInsightConsentRequestSchema.safeParse({ ...VALID, languages: Array.from({ length: 11 }, () => "en") })
        .success,
    ).toBe(false);
  });
});
