# Development

[← Back to README](../README.md)

## Tech stack

- **Frontend:** Svelte 5 (runes) and Vite, a single-page app — no SvelteKit.
- **Backend:** Go, a JSON REST API under `/api/`, chi router, pgx.
- **Database:** PostgreSQL 17. Migrations in `backend/migrations/` run at start-up.
- **Deployment:** Docker Compose — `frontend` (nginx serving the build and proxying
  `/api/`), `api`, `db`.

Financial data never reaches the API in readable form: the frontend encrypts it
into a vault (`frontend/src/lib/crypto/`). A backend package exists only for what
the vault cannot do. `CLAUDE.md` describes the architecture and conventions in
detail.

## Running it locally

```sh
docker compose up -d --build
```

| | |
|---|---|
| App | http://localhost:3000 |
| API | http://localhost:8081 |
| Mailpit (catches all email) | http://localhost:8025 |
| PostgreSQL | `localhost:5432`, user, password and database all `finance` |

These ports come from `docker-compose.override.yml`, which Compose loads by itself
when no `-f` is given. `docker-compose.yml` publishes no ports, so production,
which names its files with `-f`, publishes only the frontend.

The same command rebuilds after a change: about 15 s for the Go side, a few seconds
for the frontend. There is no hot-reload overlay; the local stack runs production
builds.

Go and Node do not need to be installed — everything builds and runs in Docker.

## Tests

```sh
# Backend unit tests — in the Go image the API is built with; the api image itself
# carries only the compiled binary
docker run --rm -v "$PWD/backend":/src -w /src golang:1.23-alpine go test ./...

# Frontend tests and type check
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine sh -c "npm ci && npm test && npm run check"

# Dependency advisories
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine npm audit --audit-level=moderate
```

CI (`.github/workflows/test.yml`) runs Go unit tests, `gofmt` and `go vet`,
frontend tests, `svelte-check`, `npm audit` and the integration tests, which use
the `integration` build tag and a PostgreSQL service.

## A manual walkthrough

Against a fresh local stack:

1. **First account.** Open http://localhost:3000 and create the administrator.
2. **Invitation.** Under **Users**, invite an address. Open Mailpit, follow the
   link, set a password — you are signed in as the new user and set up a vault.
   Keep the recovery key.
3. **Two-factor.** In **Profile**, enable two-factor, scan the code, confirm with a
   six-digit code and keep the recovery codes. Sign out and in again: the code is
   asked for after the password.
4. **Recovery code.** At the code prompt, use a recovery code instead. It works
   once only.
5. **Account deletion.** In **Profile**, delete the account with its password. The
   audit log keeps an anonymised entry.
6. **Audit log.** As the administrator, open **Audit**, or query `audit_log` in
   the database.

## Releases

Branching follows git flow: features off `develop`, releases squashed onto `main`.
See [RELEASING.md](../RELEASING.md).
