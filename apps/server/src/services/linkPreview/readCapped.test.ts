import { describe, expect, it } from "vitest";
import { readCapped } from "./readCapped.js";

function readerFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return stream.getReader();
}

describe("readCapped", () => {
  it("returns the full body when it's under the cap", async () => {
    const bytes = await readCapped(readerFromChunks(["hello ", "world"]), 1000, "truncate");
    expect(new TextDecoder().decode(bytes!)).toBe("hello world");
  });

  it("truncate mode returns exactly maxBytes, cutting mid-chunk if needed", async () => {
    const bytes = await readCapped(readerFromChunks(["0123456789", "abcdefghij"]), 15, "truncate");
    expect(new TextDecoder().decode(bytes!)).toBe("0123456789abcde");
  });

  it("discard mode returns null once the cap is exceeded, even by one byte", async () => {
    const bytes = await readCapped(readerFromChunks(["0123456789", "a"]), 10, "discard");
    expect(bytes).toBeNull();
  });

  it("truncate mode at exactly the cap boundary returns the full body, no truncation marker needed", async () => {
    const bytes = await readCapped(readerFromChunks(["0123456789"]), 10, "truncate");
    expect(new TextDecoder().decode(bytes!)).toBe("0123456789");
  });

  it("returns null when there's no reader at all", async () => {
    const bytes = await readCapped(undefined, 1000, "truncate");
    expect(bytes).toBeNull();
  });

  it("returns an empty (not null) buffer for a genuinely empty body under the cap", async () => {
    const bytes = await readCapped(readerFromChunks([]), 1000, "truncate");
    expect(bytes).not.toBeNull();
    expect(bytes!.byteLength).toBe(0);
  });
});
