import { describe, expect, it } from "vitest";
import { normalizeRecoveryPhrase } from "./RecoveryPhraseVerification.js";

describe("normalizeRecoveryPhrase", () => {
  it("accepts formatting and case differences", () => {
    expect(normalizeRecoveryPhrase("abcd2-efgh3\nJKLM4")).toBe("ABCD2EFGH3JKLM4");
  });

  it("removes characters outside the recovery-key alphabet", () => {
    expect(normalizeRecoveryPhrase("AB01-IZO2")).toBe("ABIZO2");
  });
});
