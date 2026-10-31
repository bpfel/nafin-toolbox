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
host firewalls such as `ufw`. **If the proxy runs on the same host — a VPS, a NAS —
set `NAFIN_LISTEN=127.0.0.1:4000` in `.env`**, so the app is only reachable through
the proxy. This matters for more than tidiness; see
[Trusted proxies](#trusted-proxies).

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
| `ENCRYPTION_KEY` | 64 hex characters encrypting TOTP secrets. `openssl rand -hex 32`. Back it up: losing it makes every enrolled 2FA secret unusable. Without it, 2FA cannot be turned on — not even for administrators, who otherwise must use it. The API refuses the development key this repository once published. |
| `NAFIN_SUBNET` | The stack's own Docker network, default `172.31.250.0/24`. Change it only if it collides with a network the host already has. See [Trusted proxies](#trusted-proxies). |
| `TRUSTED_PROXIES_EXTRA` | A reverse proxy on **another** machine, as CIDRs, e.g. `203.0.113.10/32`. A proxy on the same host needs nothing here. |
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
| `ENCRYPTION_KEY_FILE` | — | A file holding the key instead of `ENCRYPTION_KEY`, for Docker secrets. `ENCRYPTION_KEY` wins when both are set. |
| `TRUSTED_PROXIES` | `NAFIN_SUBNET` plus `TRUSTED_PROXIES_EXTRA`, set by compose | CIDRs allowed to say where a request came from |
| `MIGRATIONS_DIR` | `migrations` | Where the SQL migrations are |

## Reverse proxy

With nginx, Caddy, Traefik or similar in front:

1. **Terminate TLS** at the proxy.
2. **Add HSTS:** `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
3. **Forward the client address** in `X-Forwarded-For`, appending to it rather
   than replacing it (nginx: `$proxy_add_x_forwarded_for`; Caddy and Traefik do
   this by default). See [Trusted proxies](#trusted-proxies) for which proxies
   the app believes.
4. **Set `APP_URL` and `CORS_ORIGINS`** to the public HTTPS address.

### Trusted proxies

Rate limits and the audit log need to know which address a request came from. The
app reads it from `X-Forwarded-For`, walking from the right, and believes an entry
only when the hop that added it is a trusted proxy. Anyone else could put anything
in that header.

What is trusted is the stack's own Docker network, `NAFIN_SUBNET`, and nothing
else:

- **nginx in the `frontend` container** is in that network, and it is how every
  request reaches the API.
- **A reverse proxy on the same host** reaches the frontend through that
  network's gateway, which is in the subnet too, so it needs no setting.
- **A reverse proxy on another machine** is not in the subnet. Add its address to
  `TRUSTED_PROXIES_EXTRA`.

Up to 0.5, every private range (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
was trusted. Any visitor on a LAN or a VPN could then claim to be any address, and
get a fresh rate-limit bucket with every request.

**Bind to loopback.** Everything that reaches the frontend through Docker's own
port forwarding arrives from the gateway, and so is trusted. With
`NAFIN_LISTEN=127.0.0.1:4000`, the only thing that can reach it that way is your
proxy. Published on every interface, some paths from outside (IPv6 on some Docker
setups, for one) arrive the same way and would be believed too.

The API logs what it trusts when it starts:

```sh
dc logs api | grep trusting
# trusting forwarded-for headers from 172.31.250.0/24
```

To check it works, sign in with a wrong password from a phone on mobile data,
then look at the newest `login_failed` in **Audit**. It should show the phone's
public address. If it shows your proxy's address instead, the proxy isn't
trusted. If it shows an address the phone doesn't have, something trusts too
much.

## First sign-in

Open the app. The first visit shows **Create first account**: that account is the
administrator. It is asked to set up two-factor sign-in straight away, and can do
nothing else until it has. Administrators manage users and the instance, and have
no budget of their own — see [Administration](administration.md#admin-accounts).
Invite yourself as a regular user to use the app.

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
- [ ] A wrong sign-in from outside shows the right address in **Audit** — see [Trusted proxies](#trusted-proxies)
- [ ] Two-factor sign-in set up for the administrator
- [ ] Read [In case of an attack](under-attack.md) once, before you need it
- [ ] A unique `ENCRYPTION_KEY` and `POSTGRES_PASSWORD`, both backed up
- [ ] `APP_URL` and `CORS_ORIGINS` set to the public address
- [ ] SPF, DKIM and DMARC for the sending domain, if email is on
- [ ] Backups of the database — see [Administration](administration.md#backups)
