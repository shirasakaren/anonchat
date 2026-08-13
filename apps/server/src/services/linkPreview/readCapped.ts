/** The minimal shape this module needs from a stream reader - typed
 *  structurally rather than against a concrete ReadableStreamDefaultReader,
 *  since undici's stream types (used by the SSRF-safe fetch calls this is
 *  fed from) and the DOM lib's aren't nominally identical even though
 *  they're structurally almost the same. */
interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<unknown>;
}

/**
 * Drains a stream reader up to `maxBytes` without ever buffering an
 * unbounded stream. `onOverflow: "truncate"` returns what was read so far
 * once the cap is hit (fine for HTML - the OG tags this module cares about
 * are always near the top of <head>); `"discard"` returns null instead (an
 * image can't be meaningfully truncated without corrupting it). Callers
 * get the reader themselves (`response.body?.getReader()`) rather than
 * passing the response in, since "get a reader from a response" is a
 * one-liner not worth abstracting, and keeps this module decoupled from
 * whichever Response type (DOM lib vs undici) the caller has.
 */
export async function readCapped(
  reader: ByteReader | undefined,
  maxBytes: number,
  onOverflow: "truncate" | "discard",
): Promise<Uint8Array | null> {
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      if (total + value.byteLength > maxBytes) {
        if (onOverflow === "discard") {
          await reader.cancel();
          return null;
        }
        chunks.push(value.subarray(0, maxBytes - total));
        total = maxBytes;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    return null;
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}
