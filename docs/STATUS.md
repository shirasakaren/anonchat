# Project status / handoff

Last updated: 2026-08-12. Read this first if you're picking up this project
in a new session - it's the durable source of truth for what's done, what's
verified, and what's next. (Don't rely solely on an in-session task list -
this file is what's meant to survive across sessions.)

## Where things stand

Every planned feature is built, and the full stack has been exercised in a
real headless browser (Playwright) against a real Postgres instance in
Docker - not just unit-tested in isolation. **The one thing that has not
happened yet is a dedicated security review pass.** See "Immediate next
step" below.

### Done and verified

- **`packages/crypto`** - identity derivation, ECDH conversation keys, AEAD
  encryption, password-wrapped key caching. 21 unit tests passing
  (`pnpm --filter @termine/crypto run test`).
- **`packages/shared`** - zod schemas, DTOs, WS event contract. Builds clean.
- **Database** - Prisma schema + one migration, applied and tested against
  real Postgres (17-alpine) multiple times, including through Docker Compose
  and the setup script.
- **`apps/server`** - Fastify REST API, WebSocket hub, auth (anonymous
  challenge-response + admin password/TOTP), storage abstraction
  (local/S3), rate limiting, CSRF, security headers. 6 integration tests
  passing against real Postgres (`pnpm --filter @termine/server run test`).
- **`apps/web`** - public chat UI and admin dashboard, both typecheck clean
  (`pnpm --filter @termine/web run typecheck`).
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

### Known gaps (not started / deliberately deferred)

- **Security review pass has not been run.** This is task #16 and the
  natural next step - see below.
- **No DOM-dependent frontend tests** (e.g. for `markdown.ts`'s XSS
  sanitization via DOMPurify, or React component rendering) - would need a
  jsdom test environment wired into `apps/web`'s vitest config, which
  doesn't exist yet. `packages/crypto`, `packages/shared`, `apps/server`,
  and the DOM-independent parts of `apps/web` (emoji shortcodes, the E2EE
  conversation-crypto round-trip) all have real unit test coverage and pass
  (56 tests total, zero failures, as of this writing). The XSS-sanitization
  path itself was exercised manually via the Playwright browser tests
  (markdown rendered correctly, no injection observed) but doesn't have an
  automated regression test.
- **No frontend route-based code-splitting.** The Vite build produces one
  ~830KB (237KB gzipped) bundle; Vite's own build output flags this. Fine
  functionally, but `React.lazy` on the admin route tree would be a
  reasonable follow-up.
- **No PWA service worker.** `apps/web/public/manifest.webmanifest` and
  `icon.svg` exist and are linked from `index.html`, but there's no
  registered service worker, so some browsers' stricter installability
  criteria (notably Chrome/Android) won't offer "Add to Home Screen"
  without one. Spec section 58 lists this as optional/recommended, not
  required.
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

## Immediate next step

**Task #16: security review pass.** Run the `security-review` skill over
the full diff (or `git log` back to the initial commit, since this is a
fresh repo built entirely in one continuous effort) and fix what it finds,
then re-report. Given how much of this project is security-load-bearing
(E2EE design, auth, admin session handling, CSRF, rate limiting, attachment
handling), take it seriously rather than treating it as a formality.

After that, reasonable follow-ups in rough priority order:
1. Route-based code-splitting for the web bundle (quick, low-risk).
2. A minimal PWA service worker if installability matters to the user.
3. Actually deploy-test one of the five cloud templates against a real
   account, if/when the user wants that validated for real (ask first -
   each one provisions real, billable infrastructure).

## How to verify things still work

```bash
# Unit + integration tests (spins up nothing itself - point DATABASE_URL at a real Postgres)
docker run -d --name termine-dev-postgres -e POSTGRES_USER=termine -e POSTGRES_PASSWORD=termine -e POSTGRES_DB=termine -p 55432:5432 postgres:17-alpine
cd apps/server && DATABASE_URL=postgresql://termine:termine@localhost:55432/termine npx prisma migrate deploy
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
