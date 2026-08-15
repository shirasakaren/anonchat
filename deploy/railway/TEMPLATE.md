# Deploy and Host Anonchat

## About Hosting

Anonchat is a self-hosted, end-to-end encrypted, anonymous messaging inbox.
Anyone can create an anonymous identity - no email, phone number, or account -
and get a private, persistent conversation with the site owner. The owner
gets a Discord/WhatsApp-style admin dashboard with every conversation,
real-time replies, and moderation tools.

This template provisions the complete stack in one click:

- **anonchat** - the app, pulled from the official Docker image
  (`shirasakaren/anonchat:latest`), with a `/health` healthcheck
- **Postgres** - a managed PostgreSQL database on Railway's private network,
  wired to the app automatically; migrations run on every start
- **Minio** - S3-compatible object storage for attachments on the private
  network, with a persistent volume at `/data`; the app connects to it
  automatically and creates the bucket on first use

Everything is configured for you: the database URL, object storage
credentials, a freshly generated session secret, the public URL, and proxy
settings. No variables to fill in.

## Why Deploy

- **Privacy by design** - message content, attachments, and reactions are
  end-to-end encrypted; the server stores and relays ciphertext only
- **Zero-friction visitors** - no account, email, or phone number needed to
  reach you
- **One-click infrastructure** - managed Postgres, persistent storage, and
  TLS are provisioned and wired automatically
- **Operationally minimal** - the only required secret is generated for you
  on every deploy

## Common Use Cases

- A private inbox for your readers, viewers, or community
- Anonymous feedback and tip lines that stay persistent per visitor
- A support channel where people can start a conversation without signing up
- Any audience where anonymity makes people more willing to reach out

## Dependencies for Deploying Anonchat

### Deployment Dependencies

- **PostgreSQL** - provisioned by this template and connected over Railway's
  private network
- **Object storage (Minio)** - provisioned by this template with a persistent
  volume at `/data`; the `anonchat` service creates its bucket automatically.
  AWS S3, Cloudflare R2, Backblaze B2, or any S3-compatible provider can
  replace it by updating the `S3_*` variables
- **A public domain** - a `*.up.railway.app` domain is generated
  automatically; attach a custom domain at any time

## First steps

1. Click **Deploy**.
2. When the deploy finishes, open the generated `*.up.railway.app` URL.
3. Complete the one-time admin setup wizard (admin name, password, 2FA).

That's it. Visitors who open the URL can create an anonymous identity and
start chatting; you reply from the admin dashboard.

## Optional configuration

- Attach a custom domain - `PUBLIC_URL` updates automatically
- Replace Minio with AWS S3, Cloudflare R2, or another S3-compatible
  provider by updating the `S3_*` variables on the `anonchat` service
- Enable email digests (`EMAIL_DRIVER=smtp` or `resend`) and Web Push
  (`VAPID_*`) - see the `.env.example` in the
  [repository](https://github.com/shirasakaren/anonchat)

## Links

- [Repository](https://github.com/shirasakaren/anonchat)
- [Security design](https://github.com/shirasakaren/anonchat/blob/main/docs/SECURITY.md)
- [Architecture](https://github.com/shirasakaren/anonchat/blob/main/docs/ARCHITECTURE.md)
- License: MIT (see the repository README)
