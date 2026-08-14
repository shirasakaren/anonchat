# Architecture

Anonchat is a self-hosted, end-to-end encrypted, anonymous 1:1 messaging inbox. Anyone can create an anonymous identity with no email/phone/OAuth and get a persistent private conversation with the site owner (the "admin").

## Stack

- **Monorepo**: pnpm workspaces, TypeScript everywhere, ESM throughout.
- **`packages/crypto`**: isomorphic (browser + Node) cryptographic core - identity derivation, key agreement, authenticated encryption. No I/O, no framework dependency.
- **`packages/shared`**: zod schemas, DTOs, WebSocket event contract, and constants shared by both apps.
- **`apps/server`**: Fastify + PostgreSQL (via Prisma) + native WebSocket. REST API, real-time hub, file storage abstraction.
- **`apps/web`**: React + Vite SPA. Serves both the public chat and the admin dashboard from one build. Currently a single bundle (~230KB gzipped) - route-based code-splitting (`React.lazy` on the admin tree) is a straightforward follow-up, not yet done.
- **Database**: PostgreSQL is the sole source of truth. No Redis, no message queue - see "Why no Redis" below.
- **Storage**: pluggable adapter - local disk by default, or any S3-compatible endpoint (AWS S3, Cloudflare R2, Backblaze B2, self-hosted MinIO) via one implementation.

## Why true end-to-end encryption

The product spec's non-negotiable is "end-to-end security," and section 66 also lists literal end-to-end encryption as a supported capability. We built the strong version: **message content, attachment bytes, reaction emoji, and shared-note documents/media are encrypted client-side and the server only ever stores and relays ciphertext.** Concretely, this protects conversation content against anyone with access to the database or the underlying infrastructure who is _not_ one of the two conversation participants - a DB dump, a backup leak, or a compromised hosting account reveals metadata (who talked to whom, when, how much) but not what was said.

This is a deliberate, non-default-obvious choice with real consequences, documented here rather than hidden:

| Spec ask                                                                    | Consequence under true E2EE                                  | What we did                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side message content search (section 14)                             | Server cannot search ciphertext it cannot read               | Search is client-side: the admin's browser searches messages it has already fetched and decrypted. Searching by anonymous ID stays server-side (it's not secret content).                                                                                                    |
| Conversation list previews (section 13)                                     | Server cannot render "last message: ..."                     | The admin's browser fetches the latest ciphertext per conversation and decrypts it locally to render the preview.                                                                                                                                                            |
| Attachment malware/MIME scanning (section 35)                               | Server cannot inspect encrypted bytes                        | Not possible under true E2EE, by design - the same is true of Signal/WhatsApp attachments. The server enforces ciphertext size limits and randomized storage keys; the client validates the file it's about to encrypt before upload as a UX guard, not a security boundary. |
| Attachment/image previews (section 35)                                      | Server can't generate thumbnails                             | The client downloads and decrypts the ciphertext blob, then renders a `blob:` URL locally. No server-side thumbnailing.                                                                                                                                                      |
| Push notification content                                                   | Server can't put message text in a push payload              | Notifications are generic ("You have a new message"), exactly like other E2EE messengers.                                                                                                                                                                                    |
| `MAX_MESSAGE_LENGTH` enforcement                                            | Server can't measure plaintext length                        | Enforced client-side before encryption. Server enforces a generous ciphertext-envelope byte ceiling (`MAX_CIPHERTEXT_ENVELOPE_BYTES`) as its actual DoS/storage guard.                                                                                                       |
| Rich link previews (YouTube/Vimeo embeds, Open Graph cards for other links) | Server can't fetch a URL's metadata without learning the URL | The one deliberate, narrow exception to "the server never learns what's inside a conversation" - see below.                                                                                                                                                                  |

**Link previews are the one exception, and it's opt-out.** YouTube/Vimeo embeds (`VideoEmbed.tsx`) are pure client-side URL pattern matching - no server involvement, no exception to anything. Every other link gets an Open Graph preview card, which the server fetches on the client's behalf (`GET /api/link-preview`, `apps/server/src/services/linkPreview/`) - the browser can't do this itself for the vast majority of sites (CORS blocks a cross-origin fetch of arbitrary HTML), so a same-origin server round-trip is the only technically workable approach, not just the more convenient one. The server learns _that a URL was shared_ (and, since previews are fetched per-message-render rather than cached against the ciphertext, only while a client renders that message) - it never learns the message it was shared in, and this happens for a message actually decrypted by the requesting client, not by inspecting any ciphertext. This is a real, if narrow, expansion of server-side metadata beyond the existing "who talked to whom, when, how much" - flagged here rather than left implicit. An operator who'd rather the server never originate outbound requests on a user's behalf can set `LINK_PREVIEWS_ENABLED=false`.

Because this is the only place the server fetches a caller-controlled URL, it's SSRF-hardened (`apps/server/src/security/ssrfGuard.ts`): a private/reserved-IP blocklist checked both pre-flight (catches a literal-IP URL like `http://169.254.169.254/...`, which a DNS-based check alone would miss entirely) and at actual connect time via a custom resolver wired into the request (closes the TOCTOU/DNS-rebinding gap a one-time check misses), plus a scheme allowlist, short timeout, no redirect-following, and a capped, streamed read that never buffers an unbounded response.

See `docs/SECURITY.md` for the full cryptographic design.

## Identity and authentication

There is no username/password/email for anonymous users. Instead:

1. The browser generates a 256-bit random **recovery secret** (spec section 26).
2. `deriveIdentity(secret)` (in `packages/crypto`) deterministically derives an Ed25519 signing keypair and an X25519 exchange keypair from it via HKDF, plus a short public display id (`ABCD-1234`) that is a one-way hash of both public keys.
3. Registration sends only the two **public** keys plus a signature proving possession of the matching private key (`POST /api/anonymous/register`).
4. Returning to the site (same browser or a new one after entering the recovery secret) re-derives the exact same keypairs and logs in via challenge-response: the server hands out a random challenge, the client signs it, the server verifies the signature against the stored public key and issues a session cookie.

The server never sees, stores, or can derive the recovery secret. Losing it (with no active session on any device) makes the account genuinely unrecoverable - this is called out explicitly in the UI, per spec section 5.

Admin authentication is conventional (username + Argon2id-hashed password + optional TOTP), because the admin is not anonymous and needs strong, familiar account-recovery properties. Separately, the admin also holds an E2EE identity keypair (same primitives as anonymous users) used only for conversation encryption; see `SECURITY.md` for how its private key is cached in the admin's browser.

## Conversation key agreement

Every anonymous user has exactly one conversation with the admin. Both sides derive the same symmetric conversation key independently:

```
sharedSecret = X25519(myExchangeSecretKey, theirExchangePublicKey)
conversationKey = HKDF-SHA256(sharedSecret, info = "anonchat-conversation-v1:" + conversationId)
```

Neither side ever transmits this key. Messages, reaction emoji, attachment metadata, and the TipTap shared-note JSON are encrypted with XChaCha20-Poly1305 under this key before they ever leave the browser. Binary note media follows the same nonce-prefixed encrypted-blob format as message attachments; the browser decrypts it into a temporary `blob:` URL only while rendering the note.

## Shared conversation note

Each conversation has at most one note, shared only by that anonymous identity and the admin. The editor is loaded on demand so TipTap does not inflate the initial chat bundle. It supports headings, lists, quotes, code, links, and encrypted image/video/audio/file embeds. Changes autosave after an idle debounce and publish a ciphertext-only WebSocket event; concurrent edits use last-write-wins while an open editor warns before replacing unsaved local work with a newer remote version.

The server caps uploads, rate-limits note writes/downloads, scopes every route to the authenticated conversation, and deletes note media when its node is removed or the conversation is permanently deleted.

## Real-time transport

Fastify's WebSocket plugin authenticates the upgrade request using the same session cookie as REST calls, then scopes the socket: an anonymous user's socket is subscribed only to their own conversation; the admin's socket receives events for every conversation. Delivery is in-process pub/sub - correct and sufficient for the default single-instance deployment this project targets.

**Why no Redis** (spec section 51): a single Node process is enough for the target deployment (one VPS, one owner's inbox). Redis-backed pub/sub is the natural extension point if this is ever horizontally scaled, but adding it now would be infrastructure the vast majority of self-hosters don't need. The same applies to rate-limit counters and short-lived login challenges, which live in-process with TTL cleanup.

On reconnect, the client doesn't use a bespoke WebSocket replay protocol - it just re-fetches messages since its last-seen cursor over REST, which is already the durable source of truth. This satisfies "synchronize missed messages" (spec section 9) with less moving machinery.

## Notifications

Foreground updates continue to use the authenticated WebSocket connection. Optional Web Push covers closed/background tabs through a minimal service worker and a self-hosted VAPID keypair; permission is requested only after the person clicks an enable control. Push payloads are deliberately generic and contain no message plaintext. Repeated notifications use a stable tag so the operating system replaces an existing Anonchat alert instead of building an unbounded stack.

Email is optional and supports either ordinary SMTP or Resend. Visitor reply email is an explicit, one-address opt-in offered after the first sent message. Admin email is a configurable digest with an operator-enforced minimum interval, rather than one email per incoming message. Neither email path includes message content because the server cannot decrypt it.

## Optional visitor insights

Visitor diagnostics are disabled by default and require two independent decisions: the admin enables the consent flow, then each visitor explicitly opts in. The browser sends a bounded diagnostic snapshot (browser/OS/device class, viewport, locale/timezone, and connection quality). It never sends exact GPS, contacts, browsing history, canvas/font fingerprints, or decrypted chat content.

`STORE_IP_ADDRESSES=true` permits the consented IP to be retained. `VISITOR_GEOLOCATION_PROVIDER=ipwhois` additionally permits a coarse IP lookup through ipwho.is; the default `none` makes no lookup. Each row receives an expiry, an hourly cleanup removes expired rows, visitors can revoke their row immediately, and switching the feature off deletes all rows.

## Storage abstraction

`StorageAdapter` (`put`/`get`/`delete`) has two implementations: local disk (default, zero config) and an S3-compatible client (works unmodified against AWS S3, Cloudflare R2, Backblaze B2, or self-hosted MinIO by pointing `S3_ENDPOINT` at it). Attachment bytes stored through either adapter are already ciphertext by the time the server sees them.

## Deployment

Primary target is `docker compose up -d` on any VPS (see `docker-compose.yml`, `.env.example`, `scripts/setup.sh`). One-click/IaC templates for Railway, Render, AWS, GCP, and Azure live under `deploy/`. All of them build the same container image and only differ in how they provision Postgres and wire environment variables.
