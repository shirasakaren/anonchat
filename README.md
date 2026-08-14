# Anonchat

A self-hosted, end-to-end encrypted, anonymous messaging inbox. Anyone can
create an anonymous identity - no email, phone number, or account - and get
a private, persistent conversation with the site owner. The owner gets a
Discord/WhatsApp-style admin dashboard with every conversation, real-time
replies, and moderation tools.

Message content, attachments, and reactions are end-to-end encrypted:
the server stores and relays ciphertext only. See
[`docs/SECURITY.md`](docs/SECURITY.md) for the full design and its
trade-offs, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the
system fits together.

## Features

- Anonymous identity from a cryptographically random recovery key, with an optional visitor-chosen name
- Persistent 1:1 conversation per identity, end-to-end encrypted
- Real-time messaging over WebSocket, with offline/reconnect sync
- Encrypted attachments with upload/download progress, inline media, and full local document/code previews
- One shared TipTap note per conversation with encrypted rich text and playable media
- Markdown-lite formatting, emoji shortcodes, reactions, replies, edit/delete
- Admin dashboard: inbox with search/filters, archive/block/delete, canned replies, audit log
- Public admin profile panel with avatar, bio, links, public key, and an optional photo gallery
- Editable site title with the admin profile picture used automatically as the favicon
- Admin 2FA (TOTP), session management (see and revoke active devices/IPs)
- Pluggable attachment storage: local disk by default, or any S3-compatible provider
- Installable PWA shell with opt-in Web Push notifications; responsive on mobile and desktop
- Minimal required configuration; everything else has a sane default

## Quick start (self-hosted, recommended)

```bash
git clone <this-repo>
cd anonchat
./scripts/setup.sh
```

The script detects your OS, installs Docker if needed, walks you through the
handful of required settings, and brings up the full stack with
`docker compose`. When it finishes, open the printed URL to complete the
one-time admin setup wizard.

Prefer to do it by hand?

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SESSION_SECRET at minimum
docker compose up -d --build
```

See [`.env.example`](.env.example) for every configuration option and its
default.

## Local development

Two one-command launchers get you from a fresh clone to a running app.
Both auto-start a dedicated Postgres container, install dependencies if
needed, run migrations, and launch the stack. (Requires Docker and pnpm.)

```bash
./scripts/dev.sh       # hot-reload dev:  web :5173, API :3000
./scripts/preview.sh   # single-port preview: everything on :3000
```

`preview.sh` builds the web app and serves it from the Fastify server —
the same layout as the production Docker image, so `http://localhost:3000`
shows exactly what a deployed instance would.

## Deploying to a specific cloud platform

Templates for Railway, Render, AWS, GCP, and Azure live under
[`deploy/`](deploy/README.md), alongside the same Docker image used for
self-hosting.

## Development

This is a pnpm workspace monorepo:

```
apps/
  server/    Fastify API + WebSocket hub (TypeScript)
  web/       React SPA - public chat + admin dashboard (Vite)
packages/
  crypto/    End-to-end encryption primitives, shared by server and web
  shared/    Zod schemas, DTOs, and the WebSocket event contract
```

Requirements: Node.js 20+, pnpm, and a local PostgreSQL instance (or run one
via `docker run -p 5432:5432 -e POSTGRES_PASSWORD=anonchat postgres:17-alpine`).

Fastest path — the launcher scripts above handle Postgres, deps, and
migrations for you. To do it by hand:

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # set DATABASE_URL, SESSION_SECRET
pnpm --filter @anonchat/server run db:migrate:dev
pnpm run dev          # starts both the server (:3000) and web (:5173) dev servers
```

Run tests:

```bash
pnpm run test         # crypto unit tests + server integration tests (needs DATABASE_URL)
pnpm run typecheck
```

## Backups

Before production, review the [privacy technical assessment](docs/PRIVACY-TECHNICAL-ASSESSMENT.md) and complete its operator checklist. It separates safeguards implemented in code from controller-specific legal and operational decisions.

Conversations persist indefinitely by design - back up the Postgres volume
regularly:

```bash
docker compose exec postgres pg_dump -U anonchat anonchat > backup.sql
```

Restore with `docker compose exec -T postgres psql -U anonchat anonchat < backup.sql`.
If you're using local disk storage for attachments, also back up the
`uploads` Docker volume (or your S3-compatible bucket, if you configured one).

## License

MIT
