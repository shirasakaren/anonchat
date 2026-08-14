import { describe, expect, it } from "vitest";
import { formatMediaTime } from "./ThemedAudioPlayer.js";

describe("formatMediaTime", () => {
  it("formats finite media durations", () => {
    expect(formatMediaTime(0)).toBe("0:00");
    expect(formatMediaTime(65.9)).toBe("1:05");
    expect(formatMediaTime(3_661)).toBe("61:01");
  });

  it("handles unavailable durations", () => {
    expect(formatMediaTime(Number.NaN)).toBe("0:00");
    expect(formatMediaTime(-1)).toBe("0:00");
  });
});
