interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process fixed-window rate limiter. Sufficient for the default
 * single-instance deployment - see docs/ARCHITECTURE.md "Why no Redis".
 * A horizontally-scaled deployment should replace this with a shared store.
 */
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
cleanupTimer.unref();

/** Test-only: clears all bucket state. */
export function _resetRateLimiterForTests(): void {
  buckets.clear();
}
