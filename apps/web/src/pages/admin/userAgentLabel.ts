/** Turns a raw User-Agent string into a short "Browser on OS" label, the way
 *  GitHub/Slack's session lists do, instead of showing the raw UA string.
 *  Deliberately a small hand-rolled parser (not a dependency) covering the
 *  common desktop/mobile browsers - good enough for a self-hosted admin's
 *  own device list, not a general-purpose UA database. Falls back to a
 *  truncated raw string for anything it doesn't recognize. */
export function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";

  let os = "Unknown OS";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/HeadlessChrome/.test(ua)) browser = "Headless Chrome";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/CriOS\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";

  if (browser === "Unknown browser" && os === "Unknown OS") {
    return ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
  }
  return `${browser} on ${os}`;
}

export type DeviceType = "mobile" | "tablet" | "desktop";

/** Coarse device class for the Sessions page icon - lets an admin tell
 *  "phone" from "laptop" at a glance instead of reading the full label. */
export function getDeviceType(ua: string | null): DeviceType {
  if (!ua) return "desktop";
  if (/iPad|Tablet(?!.*Mobile)/.test(ua)) return "tablet";
  // Android tablets drop "Mobile" from the UA string; phones keep it.
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return "tablet";
  if (/iPhone|iPod|Android|Mobile/.test(ua)) return "mobile";
  return "desktop";
}
