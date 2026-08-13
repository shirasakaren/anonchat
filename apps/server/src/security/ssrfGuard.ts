import dns from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";

/**
 * True if `ip` is a private, loopback, link-local, "this network", or
 * multicast/reserved IPv4 address - anything not globally routable. The
 * classic SSRF blocklist for a "fetch a URL the caller controls" feature;
 * `169.254.169.254` (cloud metadata services) falls under link-local and
 * is caught by the same check, not special-cased.
 */
function isPrivateIPv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  const [a, b] = octets;
  if (a === undefined || b === undefined || octets.length !== 4) return true;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast (224-239) + reserved/broadcast (240-255)
  return false;
}

/** True if `ip` is a private, loopback, link-local, or unique-local IPv6
 *  address, including an IPv4-mapped address that itself resolves to a
 *  private IPv4 range. */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (["fe8", "fe9", "fea", "feb"].some((p) => normalized.startsWith(p))) return true; // fe80::/10 link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local
  if (normalized.startsWith("::ffff:")) {
    const embeddedV4 = normalized.slice("::ffff:".length);
    return isIP(embeddedV4) === 4 ? isPrivateIPv4(embeddedV4) : true;
  }
  return false;
}

/** Rejects anything that isn't a validly-formed IP the check functions
 *  above actually understand - fail closed on the unexpected, not open. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

export function hasAllowedScheme(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Pre-flight check combining scheme + a literal-IP-hostname check.
 * Necessary in addition to the Agent below: verified empirically that
 * undici's custom `connect.lookup` is only invoked when the target host
 * needs DNS resolution - for a URL whose hostname is already a literal IP
 * (e.g. `http://169.254.169.254/...`), undici connects directly and never
 * calls `lookup` at all, so a request like that would sail past the Agent
 * entirely with no DNS-based guard to catch it. This function is what
 * catches that case; the Agent's `lookup` hook is what catches the
 * DNS-hostname (and rebinding) case. Callers need both.
 */
export function isUrlSafeToFetch(url: URL): boolean {
  if (!hasAllowedScheme(url)) return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 URL brackets, e.g. "[::1]" -> "::1"
  if (isIP(hostname) !== 0 && isPrivateOrReservedIp(hostname)) return false;
  return true;
}

/**
 * An undici Agent whose custom DNS `lookup` re-validates every address
 * before undici is allowed to connect to it - not just once before the
 * fetch call, but on every actual connection attempt this Agent ever
 * makes. That's what closes the TOCTOU/DNS-rebinding gap a one-time
 * pre-check misses: a hostname could resolve to a public IP when checked
 * and a private one moments later at actual connect time. Routing the
 * check through the real connect-time lookup means there's no gap to
 * rebind into. One instance is reused across requests (agents are
 * connection-pooling, not per-call state).
 *
 * Callers MUST pass this as the `dispatcher` to undici's own `fetch`
 * export (`import { fetch } from "undici"`), never to Node's global
 * `fetch`. Verified empirically: Node bundles its own internal undici
 * version for global fetch (e.g. Node 22 ships undici 6.24.1), which
 * isn't guaranteed ABI-compatible with the separately-installed `undici`
 * package version this Agent is built from - mixing them throws an
 * opaque internal error ("invalid onRequestStart method") at request
 * time, not at type-check time.
 */
export function createSsrfSafeDispatcher(): Agent {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) {
            callback(err, []);
            return;
          }
          const list = Array.isArray(addresses) ? addresses : [addresses];
          if (list.length === 0 || list.some((a) => isPrivateOrReservedIp(a.address))) {
            callback(new Error(`Refusing to connect to ${hostname}: resolves to a private/reserved address`), []);
            return;
          }
          callback(null, list);
        });
      },
    },
  });
}
