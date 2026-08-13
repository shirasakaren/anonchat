import { describe, expect, it } from "vitest";
import { hasAllowedScheme, isPrivateOrReservedIp, isUrlSafeToFetch } from "./ssrfGuard.js";

describe("isPrivateOrReservedIp", () => {
  it.each([
    ["10.0.0.1", "10.0.0.0/8"],
    ["10.255.255.255", "10.0.0.0/8 upper bound"],
    ["172.16.0.1", "172.16.0.0/12 lower bound"],
    ["172.31.255.255", "172.16.0.0/12 upper bound"],
    ["192.168.1.1", "192.168.0.0/16"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "link-local / cloud metadata"],
    ["0.0.0.0", "this network"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
  ])("blocks %s (%s)", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  it.each([
    ["172.15.255.255", "just below the 172.16.0.0/12 block"],
    ["172.32.0.0", "just above the 172.16.0.0/12 block"],
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["93.184.216.34", "a public IP (example.com, historical)"],
  ])("allows %s (%s)", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });

  it.each([
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["fc00::1", "unique local"],
    ["fd12:3456::1", "unique local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
  ])("blocks IPv6 %s (%s)", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  it.each([
    ["2606:4700:4700::1111", "public IPv6 (Cloudflare DNS)"],
    ["::ffff:8.8.8.8", "IPv4-mapped public"],
  ])("allows IPv6 %s (%s)", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });

  it("fails closed on garbage input", () => {
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true);
    expect(isPrivateOrReservedIp("")).toBe(true);
  });
});

describe("hasAllowedScheme", () => {
  it("allows http and https", () => {
    expect(hasAllowedScheme(new URL("http://example.com"))).toBe(true);
    expect(hasAllowedScheme(new URL("https://example.com"))).toBe(true);
  });

  it.each(["file:///etc/passwd", "ftp://example.com", "gopher://example.com", "javascript:alert(1)"])(
    "rejects %s",
    (raw) => {
      expect(hasAllowedScheme(new URL(raw))).toBe(false);
    },
  );
});

describe("isUrlSafeToFetch", () => {
  // The most important case here: undici's custom `connect.lookup` (used
  // for DNS-hostname requests) is verified to NOT fire when the URL's
  // hostname is already a literal IP - so a direct-IP SSRF attempt would
  // sail past that guard entirely with no DNS resolution to intercept.
  // This function is the only thing that catches it.
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:6379/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://[fe80::1]/",
  ])("rejects a literal private/reserved IP in the hostname: %s", (raw) => {
    expect(isUrlSafeToFetch(new URL(raw))).toBe(false);
  });

  it("rejects a disallowed scheme even with a public-looking host", () => {
    expect(isUrlSafeToFetch(new URL("file:///etc/passwd"))).toBe(false);
  });

  it("allows a public literal IP", () => {
    expect(isUrlSafeToFetch(new URL("http://8.8.8.8/"))).toBe(true);
  });

  it("allows an ordinary DNS hostname (the Agent's connect-time lookup covers the rest)", () => {
    expect(isUrlSafeToFetch(new URL("https://example.com/path"))).toBe(true);
  });
});
