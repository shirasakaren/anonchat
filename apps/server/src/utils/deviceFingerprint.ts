/**
 * Identifies "the same device" for admin session dedup, per the product
 * requirement of one listed session per device instead of a new row every
 * login. Deliberately normalizes to OS + browser *family* (mirrors the
 * display parsing in apps/web's userAgentLabel.ts) rather than matching the
 * raw User-Agent string byte-for-byte: an ordinary browser auto-update
 * changes the raw string (e.g. Chrome 151.0.7922 -> 151.0.7935) but isn't a
 * new device, and exact-string matching would silently recreate the exact
 * duplicate-session problem this exists to fix.
 */
function normalizeUserAgent(ua: string): string | null {
  let os: string | null = null;
  if (/iPhone|iPad|iPod/.test(ua)) os = "ios";
  else if (/Android/.test(ua)) os = "android";
  else if (/Mac OS X/.test(ua)) os = "macos";
  else if (/Windows/.test(ua)) os = "windows";
  else if (/Linux/.test(ua)) os = "linux";

  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = "edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "opera";
  else if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) browser = "chrome";
  else if (/Firefox\//.test(ua)) browser = "firefox";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "safari";

  if (!os || !browser) return null;
  return `${browser}:${os}`;
}

/**
 * Returns a stable key for "this device", or null if there isn't enough
 * information to safely dedup (missing IP, or an unparseable/absent
 * User-Agent). Deliberately conservative: with only one signal present (or
 * neither), collapsing sessions risks merging genuinely different devices
 * (e.g. two people behind the same office IP sharing an "unknown browser"
 * bucket) - better to leave an ungroupable session alone than misfire.
 */
export function deviceFingerprint(ipAddress: string | null, userAgent: string | null): string | null {
  if (!ipAddress || !userAgent) return null;
  const normalized = normalizeUserAgent(userAgent);
  if (!normalized) return null;
  return `${ipAddress}|${normalized}`;
}
