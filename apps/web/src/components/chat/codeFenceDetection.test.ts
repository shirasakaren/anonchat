import { describe, expect, it } from "vitest";
import { justCompletedFreshCodeFence } from "./codeFenceDetection.js";

describe("justCompletedFreshCodeFence", () => {
  it("triggers on a fresh opening fence at the start of the text", () => {
    expect(justCompletedFreshCodeFence("```", 3)).toBe(true);
  });

  it("triggers on a fresh opening fence after a newline", () => {
    const value = "some text\n```";
    expect(justCompletedFreshCodeFence(value, value.length)).toBe(true);
  });

  it("does not trigger mid-line (fence must start a line)", () => {
    const value = "some text ```";
    expect(justCompletedFreshCodeFence(value, value.length)).toBe(false);
  });

  it("does not trigger on a fence that CLOSES an already-open block", () => {
    const value = "```js\ncode here\n```";
    expect(justCompletedFreshCodeFence(value, value.length)).toBe(false);
  });

  it("does not trigger on a 4th backtick", () => {
    const value = "````";
    expect(justCompletedFreshCodeFence(value, value.length)).toBe(false);
  });

  it("does not trigger when the cursor isn't right after the fence", () => {
    const value = "```js\ncode";
    // cursor in the middle of "code", not right after the opening fence
    expect(justCompletedFreshCodeFence(value, value.length - 2)).toBe(false);
  });

  it("does not trigger with only one or two backticks", () => {
    expect(justCompletedFreshCodeFence("`", 1)).toBe(false);
    expect(justCompletedFreshCodeFence("``", 2)).toBe(false);
  });

  it("triggers again for a second block after the first one closed", () => {
    const value = "```js\ncode\n```\nmore text\n```";
    expect(justCompletedFreshCodeFence(value, value.length)).toBe(true);
  });
});
