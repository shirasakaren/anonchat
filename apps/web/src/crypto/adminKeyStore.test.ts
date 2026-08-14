import { bytesToBase64url, deriveIdentity, generateRecoverySecret } from "@anonchat/crypto";
import { describe, expect, it } from "vitest";
import { adminIdentityMatches } from "./adminKeyStore.js";

describe("adminIdentityMatches", () => {
  it("accepts only the private identity registered to this admin account", () => {
    const registered = deriveIdentity(generateRecoverySecret());
    const stale = deriveIdentity(generateRecoverySecret());
    const publicKeys = {
      signingPublicKey: bytesToBase64url(registered.signingPublicKey),
      exchangePublicKey: bytesToBase64url(registered.exchangePublicKey),
    };

    expect(adminIdentityMatches(registered, publicKeys)).toBe(true);
    expect(adminIdentityMatches(stale, publicKeys)).toBe(false);
  });
});
