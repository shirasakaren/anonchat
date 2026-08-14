import { describe, expect, it, vi } from "vitest";
import { readResponseBytes } from "./readResponseBytes.js";

describe("readResponseBytes", () => {
  it("combines streamed chunks and reports download progress", async () => {
    const progress = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        },
      }),
      { headers: { "content-length": "4" } },
    );

    const bytes = await readResponseBytes(response, 0, progress);

    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(progress).toHaveBeenLastCalledWith(1);
  });
});
