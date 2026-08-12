# Contributing

## Getting started

```bash
git clone <this-repo>
cd anonchat
pnpm install
pnpm run dev
```

See the [README](../README.md) for detailed setup instructions.

## Development workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run the full CI suite locally before pushing:
   ```bash
   pnpm run typecheck
   pnpm run lint
   pnpm run format:check
   pnpm run test
   pnpm run build
   ```
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
5. Open a pull request against `main`

## Commit conventions

Every commit message must follow Conventional Commits:

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`chore`, `ci`, `build`, `revert`

**Scopes:** `server`, `web`, `crypto`, `shared`, `ci`, `docs`, `deps`

### Examples

```
feat(server): add rate limiting to anonymous routes
fix(web): handle WebSocket reconnect after sleep
chore(deps): bump fastify to 5.x
ci: add Docker build to CI pipeline
```

### Breaking changes

Add `!` after the type/scope, or include a `BREAKING CHANGE:` footer:

```
feat(crypto)!: switch to X25519 for key exchange
```

## Testing

- **Unit tests** (`vitest`): packages that don't need a database
- **Integration tests** (`vitest` + Postgres): the `apps/server` test
  suite needs a running PostgreSQL. Set `DATABASE_URL` and
  `SESSION_SECRET` in `apps/server/.env`, then run:
  ```bash
  pnpm --filter @anonchat/server run db:migrate
  pnpm --filter @anonchat/server run test
  ```

## Code style

- TypeScript strict mode everywhere
- Prettier for formatting (`pnpm run format:fix`)
- ESLint for linting (`pnpm run lint`)
- No `any` in new code unless interacting with an untyped boundary

## Pull requests

- Keep PRs focused — one concern per PR
- Reference related issues with `Closes #123` or `Refs #123`
- The PR title must follow Conventional Commits (enforced by CI)
- All CI checks must pass before merging

## Project structure

```
apps/
  server/    Fastify API + WebSocket hub
  web/       React SPA (Vite)
packages/
  crypto/    E2E encryption primitives
  shared/    Zod schemas, DTOs, WebSocket contract
```
