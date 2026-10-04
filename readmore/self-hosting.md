# Self-hosting

[← Back to README](../README.md)

The app is three containers — `frontend` (nginx serving the built app and proxying
`/api/`), `api` (Go) and `db` (PostgreSQL 17) — run with Docker Compose. Any
machine that runs Docker will do. For a private instance on a Synology NAS, see
[Self-hosting on a Synology NAS](synology-selfhosting.md).

**HTTPS is not optional.** The vault's encryption uses the browser's WebCrypto
API, which browsers only provide on HTTPS (and on `localhost`). Served over plain
HTTP from another machine, the app cannot unlock a vault.

## Starting it

```sh
cp .env.example .env        # then fill it in — see below
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production override turns on secure cookies, takes its secrets from `.env`,
leaves the development mail catcher out, and publishes the frontend on port
**4000**. Nothing else is published: the database and API ports exist only in
`docker-compose.override.yml`, for development, which `-f` leaves out. Put a
reverse proxy with TLS in front of port 4000.

Docker publishes port 4000 on every interface, and Docker's port rules bypass
host firewalls such as `ufw`. If the proxy runs on the same host, set
`NAFIN_LISTEN=127.0.0.1:4000` in `.env`, so the app is only reachable through the
proxy.

To check what is published:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format '{{.Service}}  {{.Ports}}'
```

Only `frontend` should list a port. Up to 0.4.0, on Docker Compose older than
2.24, the database (5432) and API (8081) were published too. See the upgrade notes
after 0.4.0 in [CHANGELOG.md](../CHANGELOG.md).

## Configuration

`.env` holds the values the production override reads:

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Database password. Generate a strong one. |
| `APP_URL` | Public base URL, used in links in emails — e.g. `https://finance.example.ch` |
| `CORS_ORIGINS` | Allowed origins for CORS and CSRF checks; usually the same as `APP_URL` |
| `NAFIN_LISTEN` | Where the frontend is published: `4000` (default, every interface) or `127.0.0.1:4000` (loopback only) |
| `ENCRYPTION_KEY` | 64 hex characters encrypting TOTP secrets. `openssl rand -hex 32`. Back it up: losing it makes every enrolled 2FA secret unusable. |
| `SMTP_HOST` | Mail server. Leave empty to disable email — see [Mail](#mail). |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (implicit TLS) |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP credentials |
| `SMTP_FROM` | Sender address |

The API also reads these, with defaults that suit the compose files:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | set by compose | PostgreSQL connection string |
| `PORT` | `8080` | API listen port |
| `COOKIE_SECURE` | `false`; `true` in production | Marks the session cookie `Secure` |
| `TRUSTED_PROXIES` | private ranges, set by compose | CIDRs allowed to set forwarded-for headers |
| `MIGRATIONS_DIR` | `migrations` | Where the SQL migrations are |

## Reverse proxy

With nginx, Caddy, Traefik or similar in front:

1. **Terminate TLS** at the proxy.
2. **Add HSTS:** `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
3. **Forward the client address** in `X-Forwarded-For`, appending to it rather
   than replacing it (nginx: `$proxy_add_x_forwarded_for`; Caddy and Traefik do
   this by default). Make sure the proxy's address falls within `TRUSTED_PROXIES`.
   Rate limits and the audit log depend on it. If the proxy isn't trusted, every
   visitor looks like the proxy, and one person's failed sign-ins count against
   all of them.
4. **Set `APP_URL` and `CORS_ORIGINS`** to the public HTTPS address.

## First sign-in

Open the app. The first visit shows **Create first account**: that account is the
administrator. Administrators manage users and the instance, and have no budget of
their own — see [Administration](administration.md#admin-accounts). Invite
yourself as a regular user to use the app.

## Mail

Email carries invitations, verification links and upkeep reminders.

**Without email.** Leave `SMTP_HOST` empty. The administrator then sets a
password when inviting someone and passes it on; the user must change it at first
sign-in.

**Infomaniak.** A domain registered with Infomaniak comes with mail:

1. In the Infomaniak Manager, under Mail, create a mailbox for the domain, e.g.
   `noreply@example.ch`.
2. Under that mailbox's devices / application passwords, create an
   **application password**. Infomaniak's SMTP refuses the ordinary mailbox
   password.
3. In `.env`:

   ```
   SMTP_HOST=mail.infomaniak.com
   SMTP_PORT=587
   SMTP_USERNAME=noreply@example.ch
   SMTP_PASSWORD=<application password>
   SMTP_FROM=noreply@example.ch
   ```
4. Restart the API and send a test invitation. `535 5.7.0 Invalid login or
   password` in the API log means the mailbox password was used instead of the
   application password.

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs api --tail 20
   ```

**Other providers.** Any SMTP relay works. Set up SPF, DKIM and DMARC for the
sending domain, or invitations will land in spam.

Avoid `$` and `#` in `.env` values where you can: Docker Compose may interpret
them.

## Checklist

- [ ] HTTPS in front of the app, with HSTS
- [ ] Frontend port bound to loopback if the proxy is on the same host
- [ ] A unique `ENCRYPTION_KEY` and `POSTGRES_PASSWORD`, both backed up
- [ ] `APP_URL` and `CORS_ORIGINS` set to the public address
- [ ] SPF, DKIM and DMARC for the sending domain, if email is on
- [ ] Backups of the database — see [Administration](administration.md#backups)
