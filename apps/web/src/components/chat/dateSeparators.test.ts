import { describe, expect, it } from "vitest";
import { formatDateSeparator, withDateSeparators } from "./dateSeparators.js";

const NOW = new Date("2026-08-13T12:00:00Z");

function daysBefore(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
}

describe("formatDateSeparator", () => {
  it("labels today as Today", () => {
    expect(formatDateSeparator(NOW, NOW)).toBe("Today");
  });

  it("labels yesterday as Yesterday", () => {
    expect(formatDateSeparator(daysBefore(1), NOW)).toBe("Yesterday");
  });

  it.each([2, 3, 4, 5, 6])("labels %i days back with a weekday name", (n) => {
    const label = formatDateSeparator(daysBefore(n), NOW);
    expect(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]).toContain(label);
  });

  it("switches to a calendar date at exactly 7 days back (not a weekday name)", () => {
    // 7 days back shares today's weekday name, so it must not read as a weekday.
    const label = formatDateSeparator(daysBefore(7), NOW);
    expect(label).not.toBe("Wednesday"); // NOW is a Thursday
    expect(label).toMatch(/^[A-Z][a-z]+ \d+$/);
  });

  it("includes the year once the date crosses into a previous year", () => {
    const label = formatDateSeparator(new Date("2025-01-01T00:00:00Z"), NOW);
    expect(label).toContain("2025");
  });
});

describe("withDateSeparators", () => {
  it("inserts one separator per distinct calendar day", () => {
    const messages = [
      { id: "1", createdAt: daysBefore(1).toISOString() },
      { id: "2", createdAt: daysBefore(1).toISOString() },
      { id: "3", createdAt: NOW.toISOString() },
    ];
    const items = withDateSeparators(messages, NOW);
    expect(items.map((i) => i.kind)).toEqual(["separator", "message", "message", "separator", "message"]);
  });

  it("returns an empty list for no messages", () => {
    expect(withDateSeparators([], NOW)).toEqual([]);
  });
});

describe("withDateSeparators unread divider", () => {
  const messages = [
    { id: "m1", createdAt: "2026-08-13T08:00:00Z" },
    { id: "m2", createdAt: "2026-08-13T09:00:00Z" },
    { id: "m3", createdAt: "2026-08-13T10:00:00Z" },
  ];

  it("inserts an unread item directly above the anchor message", () => {
    const items = withDateSeparators(messages, NOW, "m3");
    expect(items.map((i) => i.kind)).toEqual(["separator", "message", "message", "unread", "message"]);
    expect(items[3]).toEqual({ kind: "unread", key: "unread-divider" });
  });

  it("adds no unread item when no anchor is given", () => {
    const items = withDateSeparators(messages, NOW, null);
    expect(items.some((i) => i.kind === "unread")).toBe(false);
  });
});
