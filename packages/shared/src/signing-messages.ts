/**
 * Canonical byte strings signed by an anonymous identity's Ed25519 key,
 * shared verbatim between client (signs) and server (verifies) so both
 * sides always agree on exactly what was signed. Each flow uses a
 * distinctly-tagged message so a signature produced for one purpose can
 * never be replayed as proof for another.
 */

export function buildRegistrationProofMessage(signingPublicKey: string, exchangePublicKey: string): Uint8Array {
  return new TextEncoder().encode(`termine:register:v1:${signingPublicKey}:${exchangePublicKey}`);
}

export function buildLoginChallengeMessage(challenge: string): Uint8Array {
  return new TextEncoder().encode(`termine:login:v1:${challenge}`);
}
