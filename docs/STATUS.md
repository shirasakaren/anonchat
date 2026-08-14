# Project status / handoff

Last updated: 2026-08-14. Read this first if you're picking up this project
in a new session - it's the durable source of truth for what's done, what's
verified, and what's next. (Don't rely solely on an in-session task list -
this file is what's meant to survive across sessions.)

## Where things stand

The requested feature set is built, the full stack has been exercised in a
real browser against PostgreSQL, and dedicated security, privacy, UI/UX,
performance, and WCAG passes have been completed. The codebase is tested and
reviewed. Remaining items are either an optional product roadmap or operator-
specific privacy/deployment obligations; see "Known gaps" and
`docs/PRIVACY-TECHNICAL-ASSESSMENT.md`.

## Profile media and dashboard polish follow-up (2026-08-14)

- The public Photos gallery is now Media. Admins can upload images, animated
  GIFs, or browser-playable MP4, WebM, OGG, and MOV videos. Existing photos
  are migrated without loss.
- New profile media uses the configured local or S3-compatible file storage
  instead of embedding video-sized data URLs in PostgreSQL. Public media URLs
  are immutable, and video responses support byte ranges for playback and
  seeking.
- GIFs animate immediately when the visitor profile opens. Videos wait for a
  clear play action. Selecting an image or GIF opens the existing large image
  viewer with backdrop close, click zoom, wheel zoom, pan, reset, and download.
- A shared renderer keeps the visitor gallery and admin upload preview
  consistent. The existing dashboard image and video limits also apply to
  profile media.
- Collapsed dashboard navigation icons now show themed hover and keyboard
  focus tooltips, including unread context on Inbox.
- Theme cards remove redundant Dark or Light suffixes, keep every name to one
  line, reduce type size for longer labels, and show accent and message colors
  before the light or dark surface swatch.

## Attachment limits and dashboard controls follow-up (2026-08-14)

- Runtime limits moved from environment variables into persisted System
  settings. The admin can set a global upload ceiling, recommended per-type
  limits for image, video, audio, document, and other files, files per
  message, message and identity rate limits, link preview behavior, visitor
  IP/geolocation choices, and notification timing.
- The server applies the current database-backed global ceiling to every
  multipart request. The browser checks the encrypted file metadata against
  the matching per-type limit before upload and explains the exact limit in
  an in-app toast.
- Text, code, CSV, Markdown, and DOCX attachments remain compact file cards in
  the transcript. Selecting Preview decrypts them and opens the large local
  viewer. Wide rows are contained by a local horizontal scrollbar and retain
  safe space from the viewport edge.
- Video attachments use one responsive 16:9 display size across source
  resolutions, include a clear centered play control, and retain a direct
  download action. Uploading videos show a blurred local frame, play marker,
  and real upload progress.
- Chat, attachment, and settings failures now produce accessible in-app toast
  feedback instead of disappearing into the console or silent state.
- The desktop admin sidebar can collapse to a persistent icon-only rail and
  expand again; mobile navigation continues to use the labeled drawer.

Production-style browser verification at 1280 by 800 used a 120-column CSV
whose rendered table was 79,493 pixels wide. The page stayed at the 1,280
pixel viewport width, the viewer retained 64 pixels of space on both sides,
and its 1,022 pixel local pane provided the horizontal scroll. A valid 40 MB,
1920 by 1080 H.264 MP4 that the previous 25 MB limit rejected uploaded with
progress, rendered in the standard 512 by 288 player, and advanced playback.
A 110 MB video was rejected before upload with the configured 100 MB limit in
an accessible toast. The temporary identity, attachments, admin test session,
and local fixtures were removed after verification.

All 15 migrations were also applied to a fresh PostgreSQL 17 database. The
full 247-test suite passed (21 crypto, 21 shared, 103 server, 102 web), every
workspace typechecked, lint and Prettier checks passed, and the production
build completed successfully.

## Attachment and document preview follow-up (2026-08-14)

- Selecting, pasting, or dropping attachments returns focus to the existing
  Tiptap cursor so typing can continue immediately.
- File selection remains attached to the native input until encryption has
  started. This fixes Chromium revoking file access before asynchronous reads,
  which previously made some ZIP and other attachment sends fail before any
  request reached the server.
- Browser MIME gaps are filled from encrypted filename extensions for common
  image, SVG, video, audio, document, archive, and source-code formats. Unknown
  and binary formats remain sendable and download-only.
- Images, animated SVG, video, audio, and PDF decrypt automatically. Text,
  code, CSV, Markdown, and DOCX files stay compact until Preview is selected.
- PDF uses the browser's page/search/print/zoom tools. DOCX, Markdown, CSV,
  HTML, JSX, and other source/text formats use a large themed viewer with local
  scrolling, zoom, reset-to-top, download, backdrop close, and Escape close.
- Large text attachments keep their full content in a bounded local scroller.
  Syntax highlighting falls back to one plain text node above 200,000
  characters to avoid creating an unbounded highlighted DOM.
- Code blocks and text/document surfaces now explicitly use theme surface/text
  tokens instead of inheriting a possibly incompatible message-bubble color.
- Audio uses a custom themed player with play/pause, seek, time, mute, and
  volume controls. Video remains directly playable in the message.
- Multipart sends use XMLHttpRequest for real upload progress because Fetch
  does not expose upload progress. Local image/video previews are blurred while
  uploading. Attachment downloads stream into the E2EE decrypt step with their
  own receiver-side progress state.

Browser verification covered attachment-only sends, ZIP fallback download,
animated SVG, Markdown, DOCX, PDF, MP3, and MP4 on the production-style
localhost:3000 preview. The PDF blob frame loaded without CSP errors, the
custom audio player advanced playback, and all 25 theme text/surface pairs
used by document previews remained above WCAG AA contrast. The temporary test
identity and its encrypted files were permanently erased afterward.

## Product expansion and final audit (2026-08-14)

The following work is implemented on `main` after the original chat-
interaction follow-up:

- Admin profiles always have a generated default avatar, support cropped
  image uploads without deformation, and can import only the Gravatar image.
- Settings and all other dashboard pages scroll through content below the
  viewport; all 25 themes remain selectable.
- Admin sessions are deduplicated by IP plus normalized browser/OS, show a
  device-class preview, enforce their 30-day expiry, and preserve revoked
  rows only as hidden audit history.
- Admin canned replies use no-space command names and markdown bodies; typing
  `/` in the composer opens inline, keyboard-operable template suggestions.
- A configurable markdown welcome message appears before the first visitor
  message without pretending that the server owns the admin's E2EE key.
- Email notifications support SMTP and Resend. Visitor reply email is a
  separate optional email-only opt-in, admin email uses a configurable digest,
  and neither path includes message plaintext.
- Web Push is available to both roles, requests permission only after a user
  action, uses generic ciphertext-safe payloads, and coalesces repeated alerts.
- Visitor insights are off by default, require per-visitor consent, exclude
  invasive fingerprinting/exact GPS, support bounded device/network/coarse-IP
  context, expire automatically, and can be revoked immediately. The admin
  views them in an accessible right drawer with a coarse map.
- Each conversation has one shared TipTap note. Its JSON and image/video/
  audio/file media are end-to-end encrypted, autosaved, synchronized over a
  ciphertext-only event, playable, and scoped to that conversation.
- Recovery setup now offers copy/download/print, hides the displayed key, and
  requires re-entry from the saved copy before continuing for both roles.
- Unsent text drafts persist per conversation and role on the current device,
  encrypted under the conversation key. A successful send only clears the
  exact matching draft.
- Visitors can permanently erase their own identity, even when blocked, after
  a typed destructive-action confirmation. Erasure covers server content and
  metadata plus the browser recovery secret/draft. Admin permanent delete now
  has the same identity-level semantics.
- Operators can publish a privacy-policy URL, reachable before identity
  creation and from chat. IP retention is disclosed before chat creation when
  enabled. The GDPR-oriented engineering assessment and deployment checklist
  live in `docs/PRIVACY-TECHNICAL-ASSESSMENT.md`.
- Exact configured attachment-size uploads no longer fail because of the
  encryption nonce/tag overhead, visitor-insights dialogs trap/restore focus,
  and expired admin cookies cannot be replayed.
- Setup, public chat, and admin pages are route-level lazy chunks. The
  production entry chunk fell from about 906 KB to 227 KB minified and the
  build no longer reports any oversized chunk.
- The repository lints with zero warnings/errors; API error payloads are
  narrowed from `unknown`, and background requests explicitly handle failure.

Final verification used all 11 migrations on a fresh PostgreSQL 17 database:
246/246 tests passed (21 crypto, 21 shared, 103 server, 101 web), every
workspace typechecked, lint and Prettier checks were clean, and the production
build passed without a chunk-size warning. Browser verification covered
recovery download/re-entry, encrypted-draft reload, visitor self-erasure,
lazy-route reloads, and axe WCAG 2 A/AA scans with zero violations.

## Chat interaction follow-up (2026-08-14)

The chat experience was re-audited against common Slack, Discord, WhatsApp,
Zendesk, and Chatwoot interaction patterns. The following follow-up work is
implemented on `main`:

- Message deletion uses an in-app Delete for me / Delete for everyone /
  Cancel dialog, with the everyone action styled as destructive.
- Reactions open in a floating quick-react overlay and expand into the full
  themed emoji picker.
- `:shortcode` suggestions follow the textarea caret, show emoji-only results
  in a horizontally scrollable strip, support Left/Right keyboard selection,
  and cover the complete bundled emoji dataset (more than 1,900 entries).
- The custom emoji picker inherits the active Anonchat theme.
- Long unbroken message content wraps inside its bubble, long inbox previews
  truncate before the unread/action area, and alias editing uses Cancel for
  its non-saving action.
- Markdown preview remains visible beside the editable composer and updates
  while the user types.
- Direct GIF URLs and Tenor/GIPHY share links render inline when the preview
  endpoint resolves an animated GIF.
- Opening or actively viewing a conversation marks inbound messages read and
  clears list/navigation unread indicators through the realtime read event.
- Attachment-only inbox rows show a media-specific icon and label instead of
  a blank preview.
- The image viewer closes from the surrounding backdrop and supports
  click-to-toggle zoom with matching zoom cursors.

Post-follow-up verification: production build and workspace typecheck pass;
the full test suite passes against a disposable PostgreSQL database (219/219
tests: 21 crypto, 17 shared, 89 server, 92 web).

## UI/UX and accessibility audit (2026-08-13)

A full pass across the public chat and the admin dashboard - both tested
at mobile/tablet/desktop widths in headless Chromium against a real
Postgres instance, informed by researched Zendesk/Chatwoot/Intercom/
Signal/WhatsApp conventions where they translate to a 1:1 E2EE product.

### Real bugs found and fixed (severity order)

1. **CRITICAL - admin key-unlock screen was unreachable on a genuinely new
   device.** `needsKeyUnlock` only became true when a wrapped key was
   already cached in this browser's IndexedDB; on a device that had never
   cached one (the exact "log in, then paste your recovery phrase" flow
   `docs/SECURITY.md` describes as supported), it stayed false and the
   admin fell through to a dashboard where every conversation hung forever
   on "Unlocking…" with no error and no way to reach the import screen.
   Fixed in `AdminSessionContext.tsx`; verified end-to-end with a freshly
   onboarded admin and a brand-new browser profile.
2. **Message actions (react/reply/edit/delete) were unreachable on touch
   and invisible on keyboard focus.** They lived behind `opacity-0` +
   `group-hover`, which has no touch equivalent - unclickable on phone/
   tablet, not just hard to find. Fixed in `MessageBubble.tsx`: always
   visible below the `md` breakpoint, hover-or-focus-reveal above it.
3. **WCAG AA contrast failures in every one of the 25 themes** - 121
   failing text/border/button/chip/bubble pairs total, found by a from-
   scratch contrast-ratio audit against the live rendered CSS (axe-core
   alone caught only whichever theme happened to be active). Fixed by
   nudging each failing color's lightness by the smallest amount that
   clears the threshold, and adding two new tokens (`--link-fg`,
   `--border-strong`) for roles `--color-accent-600`/`--border` can't
   safely serve at every lightness.
4. **Default focus ring below 3:1 contrast in 5 themes**, including
   monochrome-dark (the default). Switched to `--border-strong`.
5. **Missing `<main>` landmarks and `<h1>`/`<h2>` headings** on admin
   sign-in, the onboarding wizard, the public landing page, the chat view,
   the recovery-key screen, and the admin inbox/conversation view.
6. **Conversation list clipped to a fixed 320px column below the tablet
   breakpoint**, leaving a dead strip down the right edge on phone-width
   viewports instead of filling the screen.
7. **Several icon buttons sat below the 24×24px WCAG 2.2 target-size
   minimum** (message actions, the attachment-remove button, the reply/
   edit-cancel button) - bumped to comply.
8. **Canned replies page had no empty state** - a brand-new admin with
   zero saved replies saw only the "add new" form, no indication canned
   replies are a real, working feature.
9. **Message links failed contrast in every theme** - `.prose-message a`
   and the attachment preview/retry label used `--link-fg`/
   `--color-accent-600`, which was only ever checked against `--surface`,
   not against the message bubble background they actually render on
   (ratios as low as 1.0:1 against `--bubble-user`). Fixed by having both
   inherit the bubble's own text color (`--bubble-user-text`/
   `--bubble-admin-text`, already >=4.5:1 against their bubble by
   construction) with an underline for the link affordance instead of
   relying on color alone.
10. **Attachment file-size label failed contrast in every theme, and the
    fix for #9 briefly regressed the button's hover state** - the
    file-size label used `--text-muted` (same "only checked against
    `--surface`" root cause as #9, pre-existing); separately, once the
    preview/retry label started inheriting bubble text color, the
    button's existing `hover:bg-[var(--surface-muted)]` fill made that
    inherited text nearly invisible on hover in 14/25 themes. Fixed the
    label the same way as #9, and swapped the hover fill for a ring so
    hovering never repaints behind inherited bubble text.

### Post-fix verification

- Re-ran the axe-core scan against `UnlockKey` in import mode with a
  genuinely fresh browser context (0 violations) - this screen was
  unreachable before bug #1 was fixed, so it had never been scanned.
- Visually confirmed the audit-log and session-list label features render
  correctly end-to-end (not just type-checked) after the admin-login rate
  limit reset on server restart.
- Re-captured tablet (768px) screenshots of the public landing page and
  admin inbox after all fixes landed - no layout regressions from the
  contrast/link changes.
- Ran the full verification path from "How to verify things still work"
  below (typecheck, lint, full build, and `pnpm run test` against a
  throwaway Postgres instance separate from the live dev database) after
  all fixes in this session - all green, 0 lint errors, 57/57 tests
  passing.

### Live admin credentials (after the DB reset in this session)

The DB was wiped twice during this audit to test onboarding from empty
state - the admin account currently live in the database is a fresh one
created during this session, not whatever existed before. Credentials
and the encryption recovery phrase were handed to the user directly and
are not recorded here (they're a per-environment secret, not something
that belongs in a checked-in doc).

### Features added

- **Unread badge on the Inbox nav item** (and a dot on the mobile
  hamburger), kept live over the same WebSocket feed already in use -
  previously a new message gave no visual signal at all if the admin was
  on Settings/Sessions/etc. with the tab focused (only a sound + an OS
  notification that skips focused tabs).
- **Human-readable audit log labels** (`admin.login` → "Signed in", etc.)
  instead of raw action codes.
- **Friendly device/browser labels on the Sessions page** ("Chrome on
  macOS" instead of the raw user-agent string).

### Tooling (not committed - scratchpad only)

A reusable Playwright driver, an axe-core runner (injected via
`Runtime.evaluate` to get around the app's `script-src 'self'` CSP - see
`page.evaluate((src) => (0, eval)(src), axeSource)` in the audit scripts
if this needs redoing), and a from-scratch WCAG contrast-ratio calculator
that reads live `getComputedStyle` values per theme rather than
hand-parsing `themes.css` (needed to correctly resolve `color-mix()` and
named-color serialization like `#c0c0c0` → `"silver"`).

### Researched but not yet implemented (optional roadmap, roughly ranked)

Full research notes (Zendesk/Chatwoot/Intercom/Front/Crisp inbox
conventions, Signal/WhatsApp/MetaMask/1Password trust-UX patterns) lived
in-session only; the ranked list below is what survived:

1. A client-side decrypted-message cache - fixes `ConversationList`'s
   current N+1 (it re-fetches a full message page per conversation just
   to render the last-message preview) and is the only honest E2EE analog
   to server-side search (search over messages the browser has already
   decrypted, never sent to the server).
2. A conversation snooze ("remind me at X") - the E2EE-compatible
   reimagining of ticket status/SLA for a solo admin.
3. A small command palette (`⌘K`) + `?` shortcut cheatsheet, scoped to
   this app's actual 1:1 action set (no assign/team actions apply).
4. An "encryption verified" indicator (Signal Automatic Key Verification
   analog) - easier here than for Signal, since the admin has exactly one
   long-lived key; only needs to alert loudly if that key ever changes.
5. A one-click client-side access/portability export containing the decrypted
   transcript, note, attachments, and server-held metadata.
6. Operator-selected automatic retention for inactive identities, revoked
   sessions, audit logs, object storage, and backups.
7. Consent-version comparison and re-consent after a material diagnostics
   purpose/category change.

### Done and verified

- **`packages/crypto`** - identity derivation, ECDH conversation keys, AEAD
  encryption, password-wrapped key caching. 21 unit tests passing
  (`pnpm --filter @anonchat/crypto run test`).
- **`packages/shared`** - zod schemas, DTOs, WS event contract. Builds clean.
- **Database** - Prisma schema + one migration, applied and tested against
  real Postgres (17-alpine) multiple times, including through Docker Compose
  and the setup script.
- **`apps/server`** - Fastify REST API, WebSocket hub, auth (anonymous
  challenge-response + admin password/TOTP), storage abstraction
  (local/S3), rate limiting, CSRF, security headers. 7 integration tests
  passing against real Postgres (`pnpm --filter @anonchat/server run test`).
- **`apps/web`** - public chat UI and admin dashboard, both typecheck clean
  (`pnpm --filter @anonchat/web run typecheck`).
- **End-to-end browser verification** (Playwright, headless Chromium, real
  Postgres in Docker) confirmed:
  - Full onboarding wizard -> admin dashboard, no manual steps stuck
  - Anonymous identity creation -> recovery phrase -> chat
  - A message sent by an anonymous user appears for the admin in real time,
    decrypts correctly, and the admin's reply appears for the user in real
    time, decrypts correctly
  - Messages persist across a page refresh
  - Attachment upload -> encrypted storage -> admin-side decrypt-and-preview
  - Block (real-time propagation to the user's own open tab, composer
    disables proactively) -> blocked send correctly rejected -> unblock ->
    archive, all via the actual UI buttons
- **Docker** - multi-stage `Dockerfile` (via `pnpm deploy`), `docker-compose.yml`,
  and `scripts/setup.sh` all actually run end-to-end (built the image, brought
  up Postgres + app, hit `/health` and `/api/site`, tore it down). Migrations
  run automatically on container start.
- **Cloud deploy templates** (Railway, Render, AWS, GCP, Azure) - all
  authored and locally validated (not deployed live - see below):
  - AWS CloudFormation: `aws cloudformation validate-template` passed against
    a real AWS account
  - GCP Terraform: `terraform validate` passed (real provider schema)
  - Azure Bicep: `az bicep build` compiles clean, zero warnings (after fixing
    3 real schema mismatches the compiler caught - see "Bugs found" below)
  - Railway TypeScript IaC: typechecked clean against the real `railway`
    npm package's bundled type declarations
  - None of the five have been applied against a live cloud account -
    doing so provisions real, billable infrastructure and wasn't something
    to do without asking first (real AWS/GCP/Railway credentials happened
    to be configured in the dev environment; deliberately left untouched).

### Real bugs found and fixed during this session

Worth knowing about if you're touching related code - these weren't
hypothetical, they reproduced in a real browser:

1. **Onboarding→dashboard hard-reload bug.** Right after finishing the setup
   wizard, the admin got dropped into "unlock your key" instead of landing
   straight on the dashboard. Root cause: `Setup.tsx` refreshing the shared
   `SiteContext` while still mounted on `/setup` caused an unrelated
   `React.Router` remount of `/setup` itself, which replayed its own
   "already onboarded → redirect" effect and forced a hard
   `window.location.assign` reload elsewhere - wiping the freshly-created
   in-memory encryption key. Fixed by decoupling `/setup`'s "already
   onboarded" check into a one-time, non-reactive mount effect, removing
   `/admin`'s redundant dependency on the same shared context value, and
   using a module-level (not React-state) flag to survive the remount.
   See the comments in `apps/web/src/App.tsx` and `apps/web/src/pages/Setup.tsx`.
2. **Duplicate message rendering.** When the WebSocket push for a
   just-sent message arrived before its own REST response did, both paths
   added it to state, producing a duplicate React key and a doubled bubble.
   Fixed in `Chat.tsx` and `ConversationView.tsx`'s `performSend` by
   deduping on the real message id before appending.
3. **Admin inbox wasn't live.** `ConversationList` only fetched
   conversations on mount/filter-change - a brand-new conversation or a new
   message on an unopened one never appeared without a manual refresh,
   directly violating the spec's "admin should immediately see the new
   conversation." Fixed by giving `ConversationList` its own WebSocket
   subscription that invalidates the relevant cached preview and re-fetches.
4. **Docker: `prisma` CLI missing from the production image.** It was a
   devDependency, so `pnpm deploy --prod` excluded it, and the entrypoint's
   `prisma migrate deploy` would have failed at container startup. Moved to
   a regular dependency.
5. **Docker: Prisma Client not initialized after `pnpm deploy`.** `pnpm
deploy` re-resolves `node_modules` into a fresh virtual store that
   doesn't carry over the client generated during the build stage. Fixed by
   re-running `prisma generate` inside the deployed directory as a final
   Dockerfile step.
6. **Azure Bicep schema mismatches** (caught by `az bicep build`, not
   guessed): the AVM Postgres flexible-server module's `availabilityZone`
   and `version` params are strings with a restricted allowlist (not the
   `-1` / `'17'` shown in some upstream examples for a different module
   version), and the container-app module's `cpu` field is a plain number,
   not a string. All fixed; template now compiles with zero errors/warnings.

### Security review (done)

A dedicated review pass (crypto core, auth/session/CSRF, WebSocket hub,
every route's ownership/authorization scoping, storage adapters, frontend
key handling, Docker/secrets config) found and fixed the following, most
severe first. All are on `main`; see the individual commit messages for
exact diffs.

1. **CRITICAL - blocked users could still edit/delete/react.** `Conversation.status`
   was only checked by `createMessage` (the send path). `editMessage`,
   `deleteMessage`, and `setReaction` never checked it at all, and the
   frontend didn't gate those buttons either - a blocked user could still
   wipe their own message history (destroying moderation evidence) or spam
   reactions on the admin's messages indefinitely. Fixed server-side
   (`message.service.ts`, with a regression test) and client-side
   (`MessageBubble.tsx`/`Chat.tsx` now disable those buttons when blocked).
2. **HIGH - no rate limiting on edit/delete/react or attachment downloads.**
   Only the two message-_send_ routes were throttled. Fixed by rate-limiting
   all of them (anon and admin sides).
3. **LOW - admin message edit/delete/react weren't audit-logged**, unlike
   every other admin mutation (block/archive/delete/etc). Fixed.
4. **Anonymous `/challenge` and `/recover` had no rate limit**, unlike
   `/register` and admin `/login` - each call inserts into an in-memory
   challenge map evicted only by a 60s sweep, so an unthrottled flood could
   outgrow the sweep. Fixed.
5. **`@fastify/multipart` only capped `fileSize`/`files`**, leaving
   `fields`/`fieldSize`/`parts` at busboy's effectively-unbounded defaults -
   a request could pad itself with oversized non-file fields before ever
   reaching a file part. Fixed with explicit bounds.
6. **No Origin check on the `/ws` upgrade.** `SameSite=Lax` on the session
   cookie already blunts cross-site WebSocket hijacking in modern browsers,
   but added an explicit Origin allowlist check as defense-in-depth that
   doesn't depend on that.
7. **`docker-compose.yml`'s optional `minio` profile had an insecure default
   password** (`MINIO_ROOT_PASSWORD:-changeme12345`) if the operator enabled
   it by hand instead of via `scripts/setup.sh` (which already generates a
   strong one). Removed the fallback - it's required now, same as
   `POSTGRES_PASSWORD`.
8. **`.env.example`'s `TURNSTILE_*` comment implied CAPTCHA protection that
   doesn't exist** - the server never actually verifies a token against
   those keys (there's no CAPTCHA integration at all yet, only the env vars
   and the site-key passthrough). Corrected the comment to say so plainly
   rather than leaving an operator with a false sense of bot protection.
9. **Attachment downloads sent `Cache-Control: ... immutable, max-age=1y`.**
   A deleted attachment's ciphertext could still linger in the browser's
   disk cache long after server-side deletion. Changed to `no-store`.

Deliberately **not** changed (assessed as acceptable, not fixed to avoid
scope creep on a review pass - see "Known gaps" if you want to pick these
up):

- Attachment upload/download still fully buffers in memory rather than
  streaming to/from storage. Bounded by existing size caps (25MB/attachment
  x 5/message by default = ~125MB/request) and now also rate-limited; a
  real fix would mean changing the `StorageAdapter` interface to streams.
- Turnstile/CAPTCHA itself is still unimplemented (see finding 8) - only
  its misleading documentation was fixed. Implementing it is a feature
  addition, not a bug fix.

### Known gaps (not started / deliberately deferred)

- **No DOM-dependent frontend tests** (e.g. for `markdown.ts`'s XSS
  sanitization via DOMPurify, or React component rendering) - would need a
  jsdom test environment wired into `apps/web`'s vitest config, which
  doesn't exist yet. `packages/crypto`, `packages/shared`, `apps/server`,
  and the DOM-independent parts of `apps/web` (emoji shortcodes, the E2EE
  conversation-crypto round-trip) all have real unit test coverage and pass
  (57 tests total, zero failures, as of this writing). The XSS-sanitization
  path itself was exercised manually via the Playwright browser tests
  (markdown rendered correctly, no injection observed) but doesn't have an
  automated regression test.
- **No frontend route-based code-splitting.** The Vite build produces one
  ~830KB (237KB gzipped) bundle; Vite's own build output flags this. Fine
  functionally, but `React.lazy` on the admin route tree would be a
  reasonable follow-up.
- **GCP/Azure attachment storage requires external S3-compatible
  credentials** (or GCS's S3-compatible API for GCP specifically) because
  neither Cloud Run nor Container Apps has persistent local disk by default.
  This is documented honestly in each template's README rather than papered
  over - not a bug, but worth knowing if you're the one running `terraform
apply` or `az deployment group create`.
- **Cloud templates are unvalidated against a live account.** Local
  schema/syntax validation passed for all five (see above), but nothing has
  actually been deployed. The first real `terraform apply` /
  `az deployment group create` / `aws cloudformation deploy` / `railway
config apply` for each is still an unknown - budget time to debug on
  first real deploy.

## Suggested next steps

Nothing is blocking or required - the project is feature-complete, tested,
and has been through both a security review pass and a UI/UX + WCAG 2.2 AA
pass. If picking this up further, reasonable follow-ups in rough priority
order:

1. The ranked, researched feature list at the end of "UI/UX and
   accessibility audit" above - a client-side decrypted-message cache
   (item 2 there) is the single highest-leverage one, since it fixes a
   real performance issue and unlocks client-side search at the same time.
2. Route-based code-splitting for the web bundle (quick, low-risk).
3. A minimal PWA service worker if installability matters to the user.
4. Streaming attachment upload/download instead of full in-memory
   buffering, if this instance expects heavy attachment traffic (see
   "Security review" above for why this was deliberately left as-is).
5. Actually implementing Turnstile/CAPTCHA verification if bot signups
   become a real problem (today's mitigation is the per-IP rate limit).
6. Actually deploy-test one of the five cloud templates against a real
   account, if/when the user wants that validated for real (ask first -
   each one provisions real, billable infrastructure).

## How to verify things still work

```bash
# Unit + integration tests (spins up nothing itself - point DATABASE_URL at a real Postgres)
docker run -d --name anonchat-dev-postgres -e POSTGRES_USER=anonchat -e POSTGRES_PASSWORD=anonchat -e POSTGRES_DB=anonchat -p 55432:5432 postgres:17-alpine
cd apps/server && DATABASE_URL=postgresql://anonchat:anonchat@localhost:55432/anonchat npx prisma migrate deploy
pnpm run test          # from repo root: crypto unit tests + server integration tests
pnpm run typecheck     # all packages/apps

# Full stack via Docker Compose
cp .env.example .env   # set POSTGRES_PASSWORD and SESSION_SECRET
docker compose up -d --build
curl http://localhost:3000/health

# Or the guided path
./scripts/setup.sh
```

## Reading order for a fresh session

1. This file.
2. `docs/ARCHITECTURE.md` - system design and the reasoning behind the
   non-obvious choices (true E2EE, no Redis, etc.).
3. `docs/SECURITY.md` - threat model and cryptographic design in detail.
4. `deploy/README.md` - cloud deploy template index, if that's the task.
5. `git log --oneline` - the commit history is granular and each message
   describes one coherent change; skimming it gives a good sense of build
   order without re-reading every file.
