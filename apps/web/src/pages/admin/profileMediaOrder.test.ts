import { describe, expect, it } from "vitest";
import { mediaOrdersEqual, moveMediaOrder, reconcileMediaOrder } from "./profileMediaOrder.js";

describe("profile media order", () => {
  it("moves a media item into the selected slot without mutating the input", () => {
    const original = ["one", "two", "three"];
    expect(moveMediaOrder(original, "three", "one")).toEqual(["three", "one", "two"]);
    expect(original).toEqual(["one", "two", "three"]);
  });

  it("preserves a draft while reconciling uploads and deletions", () => {
    expect(reconcileMediaOrder(["three", "one", "two"], ["one", "three", "four"])).toEqual(["three", "one", "four"]);
  });

  it("compares order as well as membership", () => {
    expect(mediaOrdersEqual(["one", "two"], ["one", "two"])).toBe(true);
    expect(mediaOrdersEqual(["one", "two"], ["two", "one"])).toBe(false);
  });
});
