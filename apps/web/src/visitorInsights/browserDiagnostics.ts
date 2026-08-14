import type { VisitorInsightConsentRequestInput } from "@anonchat/shared";

interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface NavigatorWithDiagnostics extends Navigator {
  deviceMemory?: number;
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
  userAgentData?: { platform?: string; mobile?: boolean };
}

function firstMatch(value: string, pattern: RegExp): string | null {
  return value.match(pattern)?.[1] ?? null;
}

function describeUserAgent(userAgent: string) {
  if (/Edg\//.test(userAgent)) return { browserName: "Edge", browserVersion: firstMatch(userAgent, /Edg\/([\d.]+)/) };
  if (/Firefox\//.test(userAgent))
    return { browserName: "Firefox", browserVersion: firstMatch(userAgent, /Firefox\/([\d.]+)/) };
  if (/CriOS\//.test(userAgent))
    return { browserName: "Chrome", browserVersion: firstMatch(userAgent, /CriOS\/([\d.]+)/) };
  if (/Chrome\//.test(userAgent))
    return { browserName: "Chrome", browserVersion: firstMatch(userAgent, /Chrome\/([\d.]+)/) };
  if (/Safari\//.test(userAgent))
    return { browserName: "Safari", browserVersion: firstMatch(userAgent, /Version\/([\d.]+)/) };
  return { browserName: null, browserVersion: null };
}

function describeOs(userAgent: string) {
  if (/Android/.test(userAgent)) return { osName: "Android", osVersion: firstMatch(userAgent, /Android ([\d.]+)/) };
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return { osName: "iOS/iPadOS", osVersion: firstMatch(userAgent, /OS ([\d_]+)/)?.replaceAll("_", ".") ?? null };
  }
  if (/Windows NT/.test(userAgent))
    return { osName: "Windows", osVersion: firstMatch(userAgent, /Windows NT ([\d.]+)/) };
  if (/Mac OS X/.test(userAgent)) {
    return { osName: "macOS", osVersion: firstMatch(userAgent, /Mac OS X ([\d_]+)/)?.replaceAll("_", ".") ?? null };
  }
  if (/Linux/.test(userAgent)) return { osName: "Linux", osVersion: null };
  return { osName: null, osVersion: null };
}

function referrerOrigin(): string | null {
  if (!document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

/** Runs only inside the click handler for the visitor's explicit consent.
 * No stable fingerprint is generated or persisted on the client. */
export function collectBrowserDiagnostics(): VisitorInsightConsentRequestInput {
  const nav = navigator as NavigatorWithDiagnostics;
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  const ua = navigator.userAgent || "";
  const browser = describeUserAgent(ua);
  const os = describeOs(ua);
  const touchPoints = navigator.maxTouchPoints || 0;
  const mobile = nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPod/.test(ua);
  const tablet =
    /iPad|Tablet/.test(ua) || (!mobile && touchPoints > 1 && Math.min(screen.width, screen.height) < 1_400);
  return {
    consented: true,
    userAgent: ua || null,
    ...browser,
    ...os,
    deviceType: tablet ? "tablet" : mobile ? "mobile" : "desktop",
    platform: nav.userAgentData?.platform || navigator.platform || null,
    language: navigator.language || null,
    languages: Array.from(navigator.languages ?? []).slice(0, 10),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screenWidth: screen.width || null,
    screenHeight: screen.height || null,
    viewportWidth: window.innerWidth || null,
    viewportHeight: window.innerHeight || null,
    pixelRatio: window.devicePixelRatio || null,
    colorDepth: screen.colorDepth || null,
    touchPoints,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    connectionType: connection?.type ?? null,
    connectionEffectiveType: connection?.effectiveType ?? null,
    connectionDownlinkMbps: connection?.downlink ?? null,
    connectionRttMs: connection?.rtt ?? null,
    connectionSaveData: connection?.saveData ?? null,
    referrerOrigin: referrerOrigin(),
  };
}
