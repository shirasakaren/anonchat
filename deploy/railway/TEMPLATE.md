# Anonchat

Anonchat is a self-hosted, end-to-end encrypted, anonymous messaging inbox.
Anyone can create an anonymous identity - no email, phone number, or account -
and get a private, persistent conversation with the site owner. The owner
gets a Discord/WhatsApp-style admin dashboard with every conversation,
real-time replies, and moderation tools.

Message content, attachments, and reactions are end-to-end encrypted: the
server stores and relays ciphertext only.

## What this template provisions

- **anonchat** - the app, pulled from the official Docker image
  (`shirasakaren/anonchat:latest`), with a persistent volume at
  `/app/data/uploads` for attachment storage and a `/health` healthcheck
- **Postgres** - a managed PostgreSQL database on Railway's private network,
  wired to the app automatically; migrations run on every start

Everything is configured for you: the database URL, a freshly generated
session secret, the public URL, and proxy settings. No variables to fill in.

## First steps

1. Click **Deploy**.
2. When the deploy finishes, open the generated `*.up.railway.app` URL.
3. Complete the one-time admin setup wizard (admin name, password, 2FA).

That's it. Visitors who open the URL can create an anonymous identity and
start chatting; you reply from the admin dashboard.

## Optional configuration

- Attach a custom domain - `PUBLIC_URL` updates automatically
- Switch attachment storage to S3/R2/B2 by setting `STORAGE_DRIVER=s3` plus
  the `S3_*` variables on the `anonchat` service
- Enable email digests (`EMAIL_DRIVER=smtp` or `resend`) and Web Push
  (`VAPID_*`) - see the `.env.example` in the
  [repository](https://github.com/shirasakaren/anonchat)

## Links

- [Repository](https://github.com/shirasakaren/anonchat)
- [Security design](https://github.com/shirasakaren/anonchat/blob/main/docs/SECURITY.md)
- [Architecture](https://github.com/shirasakaren/anonchat/blob/main/docs/ARCHITECTURE.md)
- License: MIT (see the repository README)
