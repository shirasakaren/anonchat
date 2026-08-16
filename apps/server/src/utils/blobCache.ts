/**
 * In-process LRU cache of recently-served attachment/asset ciphertext.
 *
 * The single-instance deployment this project targets (see
 * docs/ARCHITECTURE.md - "Why no Redis") makes a size-bounded in-memory
 * cache the honest caching layer: a solo admin's browser re-opens the same
 * conversation repeatedly, and serving those blobs from RAM instead of
 * re-reading disk/object storage on every request removes most of the
 * repeat-download work without introducing an external dependency.
 *
 * Two safety valves keep it honest:
 * - a hard total-byte budget with LRU eviction (a conversation's images
 *   never push the process into OOM territory), and
 * - explicit eviction wherever storage.delete is called, so a deleted
 *   message's ciphertext leaves memory at the same time it leaves disk
 *   (the TTL is only a backstop for paths that forget to evict).
 */

const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** Objects above this size are streamed straight through instead of
 *  buffered - a 100MB video should not be held whole in RAM. Exported so
 *  download routes can skip the buffer step for oversized objects. */
export const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
/** Backstop: entries expire even if no delete path evicted them. */
const MAX_ENTRY_AGE_MS = 60 * 60 * 1000;

interface Entry {
  bytes: Buffer;
  lastUsed: number;
}

const entries = new Map<string, Entry>();
let totalBytes = 0;

function evictOldest(neededBytes: number): void {
  // Map iteration is insertion order; re-inserting on access (below) keeps
  // it in LRU order, so the first entry is the least recently used.
  for (const [key, entry] of entries) {
    if (totalBytes + neededBytes <= MAX_TOTAL_BYTES) return;
    entries.delete(key);
    totalBytes -= entry.bytes.byteLength;
  }
}

function evictExpired(now: number): void {
  for (const [key, entry] of entries) {
    if (now - entry.lastUsed > MAX_ENTRY_AGE_MS) {
      entries.delete(key);
      totalBytes -= entry.bytes.byteLength;
    }
  }
}

export function getCachedBlob(key: string): Buffer | null {
  const entry = entries.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now - entry.lastUsed > MAX_ENTRY_AGE_MS) {
    entries.delete(key);
    totalBytes -= entry.bytes.byteLength;
    return null;
  }
  entry.lastUsed = now;
  // Re-insert to move this key to the back of the LRU order.
  entries.delete(key);
  entries.set(key, entry);
  return entry.bytes;
}

export function putCachedBlob(key: string, bytes: Buffer): void {
  if (bytes.byteLength > MAX_ENTRY_BYTES) return;
  const existing = entries.get(key);
  if (existing) totalBytes -= existing.bytes.byteLength;
  evictOldest(bytes.byteLength);
  entries.delete(key);
  entries.set(key, { bytes, lastUsed: Date.now() });
  totalBytes += bytes.byteLength;
  evictExpired(Date.now());
}

export function evictCachedBlob(key: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  totalBytes -= entry.bytes.byteLength;
}
