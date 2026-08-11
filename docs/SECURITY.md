# Security

## Threat model

Termine is marketed as **"anonymous to the owner and the public," not "impossible to identify"** (spec section 67). Concretely:

- Other anonymous users can never read, enumerate, or infer the existence of anyone else's conversation. Every API call and WebSocket subscription is authorized against the caller's own session server-side - never against a client-supplied id (spec sections 27-29).
- Message content, attachment bytes, and reaction emoji are end-to-end encrypted (see below). Someone with read access to the database, backups, or the host - but without the admin's browser/device or an anonymous user's recovery secret - sees only ciphertext and metadata (timestamps, sender type, message sizes).
- The server operator (whoever runs the container) can see connection metadata (IP addresses, if enabled) and could modify server code to behave maliciously. E2EE does not protect against a compromised or malicious server *build*; it protects the data at rest and in transit against passive access to storage/infrastructure. This is the same honest boundary every E2EE messenger operates under.
- We do not attempt to hide a user's IP address from the server at the network layer (no built-in Tor/mixnet). `STORE_IP_ADDRESSES` controls whether that address is *persisted*; the server always sees it on the wire like any web app.

## Cryptographic design

All primitives come from the audited [`@noble`](https://paulmillr.com/noble/) libraries (`@noble/curves`, `@noble/ciphers`, `@noble/hashes`), used identically in the browser and in Node.

| Purpose | Primitive |
|---|---|
| Identity signing keypair | Ed25519, seed derived via HKDF-SHA256 |
| Identity exchange keypair | X25519, seed derived via HKDF-SHA256 (independent branch from the same secret - not a curve conversion) |
| Conversation key agreement | X25519 ECDH + HKDF-SHA256, domain-separated per conversation id |
| Message / attachment-metadata / reaction encryption | XChaCha20-Poly1305 (24-byte random nonce per message - safe without a counter) |
| Login/recovery proof | Ed25519 signature over a server-issued, single-use, 120-second challenge |
| Registration proof-of-possession | Ed25519 signature over a domain-tagged message containing both submitted public keys |
| Admin password hashing | Argon2id |
| Browser-local key caching (admin) | scrypt (N=2^17, r=8, p=1) password-derived key wrapping the cached secret with XChaCha20-Poly1305 |
| Admin TOTP secret at rest | XChaCha20-Poly1305 with a key derived from `SESSION_SECRET` via HKDF (see below) |

### Anonymous identity

A 256-bit random "recovery secret" is the only credential. `deriveIdentity()` deterministically derives both keypairs and a public display id from it. The server stores only the two **public** keys and the public id - never the secret, never anything from which it could be derived. This is intentional: it means the server can never reconstruct an anonymous user's private key, even under compulsion, and it is also why losing the recovery secret (with no logged-in browser left) is unrecoverable. The UI makes this explicit before the user leaves the onboarding screen.

### Admin identity

The admin has two independent credential sets that must not be confused:

1. **Login credentials** (username + Argon2id password hash + optional TOTP) - conventional, recoverable via normal admin-account processes, gate access to the dashboard.
2. **Encryption keypair** - generated once during onboarding, used only to compute conversation keys with anonymous users. Its private key is never sent to or stored unencrypted on the server. It is cached in the admin's browser (IndexedDB), wrapped with a key derived from the admin's login password via scrypt, so the admin isn't asked to re-paste their encryption recovery phrase on every page load of a browser they've already unlocked. On a new device, the admin logs in normally, then enters their encryption recovery phrase once to unlock message decryption there.

Losing the admin's encryption recovery phrase with no unlocked browser left means historical messages become permanently unreadable, even though the admin account itself (login) is unaffected. This trade-off is inherent to real E2EE and is surfaced clearly during onboarding.

### `SESSION_SECRET` and at-rest secondary encryption

`SESSION_SECRET` signs session cookies/CSRF tokens and, via HKDF, derives a server-side key used only to encrypt the admin's TOTP secret at rest (defense in depth against a DB-only leak). It is **not** a master key for conversation content - conversation content encryption never depends on anything the server holds.

## Session security

- Sessions are opaque random tokens; the database stores only their hash, so a database leak alone does not hand out live sessions.
- Anonymous sessions persist until explicit logout (spec section 5) - no forced expiry.
- Admin sessions expire on a sliding TTL and are individually listed/revocable from the dashboard, showing IP address, user agent, and last-seen time (spec section 21).
- CSRF protection on all cookie-authenticated state-changing requests; `SameSite` and `Secure` cookies; strict CORS.
- Rate limiting on message sending, identity registration, and admin login (in-process token buckets, per spec section 25) - swap in a shared store if you horizontally scale.

## Known limitations (read before relying on this for high-stakes anonymity)

- **No server-side content search or moderation scanning.** Ciphertext cannot be searched, scanned for malware, or auto-moderated server-side. See `docs/ARCHITECTURE.md`'s trade-off table.
- **Single-instance real-time and rate limiting by default.** Horizontal scaling needs a shared pub/sub and counter store (Redis is the natural fit) - not included, since most self-hosted deployments are a single instance.
- **This is not a network anonymity tool.** It does not hide a visitor's IP address from the server; combine with Tor/a VPN yourself if that matters for your threat model.
- **Recovery secrets and admin encryption recovery phrases are bearer secrets.** Anyone who obtains one can read that conversation's history. Treat them like a private key, not a password you can rotate after a leak.

## Reporting a vulnerability

Please report security issues privately to the project maintainer rather than opening a public issue, and allow time for a fix before public disclosure.
