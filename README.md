# nafin-toolbox

Self-hosted personal finance web app for budget management, account tracking, and investment monitoring.

## Design Philosophy

**Modular & progressive.** The app starts empty — zero accounts, no predefined categories, no assumptions. Each module (budgeting, accounts, allocations, 3a, investments) is an opt-in building block. Users enable and configure only what matches their financial situation, and can grow their setup over time.

- First launch = blank dashboard with an "Add module" flow
- Each module is self-contained but can contribute to cross-cutting views (net worth, snapshots)
- No module depends on another — you can track only investments, or only a budget, or everything
- Progressive disclosure: simple setup first, advanced options (API keys, allocation rules) revealed as needed

## Modules

### Budget & Cash Flow
- Monthly income vs. expenses
- Categorized spending (rent, food, transport, etc.)
- Budget targets per category with over/under tracking

### Accounts
- Bank accounts, savings accounts, cash positions
- Balance tracking (manual entry; bank-API sync as stretch goal)
- Account-level transaction history

### Monthly Allocations
- Define rules for distributing income across accounts each month
- Track planned vs. actual allocations
- Visualize allocation flow (income -> accounts)

### Pillar 3a (Old-Age Provision)
- Retirement savings accounts (tax-advantaged)
- Yearly contribution tracking against legal maximum
- Provider and fund details
- Performance over time

### Pillar 3b (Investments)
Three asset sub-types with different valuation strategies:

| Asset Type | Valuation | Example Sources |
|---|---|---|
| Traded securities (stocks, ETFs) | Automatic via API | Yahoo Finance, Alpha Vantage, Twelve Data |
| Physical gold | Weight x spot price via API | Gold API, metals-api.com |
| Unlisted / untraded stocks | Manual entry | - |

- Portfolio overview with current market values
- Purchase history, cost basis, unrealized gains/losses
- Dividend / distribution tracking

## Cross-Cutting Features (available once any module is active)
- **Net worth dashboard** — aggregates all enabled modules into a single view
- **Historical snapshots** — monthly/yearly net worth over time (only includes active modules)
- **Base currency:** CHF (with optional multi-currency support)
- **Data import/export** (CSV at minimum)
- **Authentication** — multi-user with invite-only registration, email verification, and optional TOTP 2FA

## Security Features

### Authentication & Sessions
- **Invite-only registration** — no open signup. Admins invite users by email; users set their own password via a verification link.
- **Email verification** — invited users receive a time-limited token link. Until verified, login is blocked.
- **Hashed sessions** — session tokens are SHA-256 hashed before storage. Raw tokens exist only in cookies and memory.
- **HttpOnly, SameSite=Lax cookies** — session cookies are not accessible via JavaScript. `Secure` flag enabled in production (set `COOKIE_SECURE=true`).
- **Automatic session cleanup** — expired sessions, verification tokens, and MFA challenges are purged hourly.
- **Password hashing** — bcrypt with default cost factor.
- **Password policy** — minimum 8 characters enforced on all password endpoints.

### Two-Factor Authentication (TOTP)
- **Optional per-user** — users enable 2FA from Security Settings using any TOTP app (Google Authenticator, Authy, etc.).
- **Admin enforcement** — admins can require all users to enable 2FA via `POST /api/auth/settings/require-2fa`. Users without 2FA see a mandatory setup screen.
- **Encrypted secrets** — TOTP secrets are encrypted with AES-256-GCM before storage. The encryption key (`ENCRYPTION_KEY` env var) never touches the database.
- **Recovery codes** — 10 single-use bcrypt-hashed recovery codes generated when 2FA is enabled. Can be regenerated (invalidates old codes).
- **Two-step login** — password verification → MFA challenge token (5-min TTL, single-use) → TOTP code → session created.

### Security Headers & Request Protection
- **CSRF protection** — Origin header validation on all state-changing requests.
- **Rate limiting** — login, setup, verify-email, and verify-2fa endpoints are rate-limited per IP.
- **Trusted proxy support** — `TRUSTED_PROXIES` CIDR list controls which reverse proxies can set `X-Forwarded-For` / `X-Real-IP`.
- **Security headers** — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy`, `Permissions-Policy` (all set by nginx).

### Audit Log
- All security-relevant actions are logged to the `audit_log` table with user ID, event type, IP address, user agent, and optional metadata (JSONB).
- Events tracked: `login_success`, `login_failed`, `logout`, `password_changed`, `2fa_enabled`, `2fa_disabled`, `2fa_failed`, `recovery_code_used`, `user_invited`, `email_verified`, `user_deleted`.
- On user deletion, audit log entries are preserved with `user_id` set to NULL (anonymized but retained for forensics).

### Data Protection (DSGVO/nDSG)
- **Data minimization** — only email stored as PII.
- **Right to deletion** — `DELETE /api/auth/account` cascades all user data. Audit logs anonymized.
- **Encryption at rest** — TOTP secrets (AES-256-GCM), passwords (bcrypt), sessions (SHA-256), recovery codes (bcrypt).

## Development

Run the full stack locally:

```sh
docker compose up -d --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8081
- Mailpit (dev email): http://localhost:8025

Rebuild after code changes with the same command. Go recompile takes ~10s, frontend ~3s.

## Budget Defaults — Maintenance Notes

The budget module ships with default categories and amounts based on **BFS HABE 2023** (Swiss Federal Statistical Office, Household Budget Survey). These live in `backend/internal/budget/defaults.go` and are only used when a user seeds their budget for the first time (`POST /api/budget/seed-defaults`). Changing the defaults does **not** affect existing user data.

The following values should be reviewed periodically:

| Default | Why it changes | Typical cadence |
|---|---|---|
| Health Insurance (`391.67`) | Premiums are set annually by the BAG | Every January |
| Taxes (`833.33`) | Depends on canton, income bracket, deductions | Yearly or on life changes |
| Rent (`1350.00`) | Regional market reference; not auto-updated | When BFS publishes new data |
| Other Insurance (`166.67`) | Reflects an average across liability, household, etc. | Every few years |
| Food & Groceries, Transportation, etc. | BFS HABE averages for a single-person household | When BFS publishes new HABE (every ~2 years) |
| Salary (`6000.00`) | Placeholder net income for a single person | As needed |

When BFS publishes a new HABE edition, update the `Amount` fields in `BFSDefaults()` and note the data source year in the function comment.

## Category Archiving (not yet wired up)

The backend supports archiving budget categories (soft-delete). The DB column, store filtering, and update endpoint are in place — but the frontend has no UI for it yet. Useful for categories that no longer apply (ended lease, stopped side hustle) while keeping historical period data intact. To finish: add an "archive" action to category management and a "show archived" toggle to the category list.

## Production Deployment

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `PORT` | `8080` | API server port |
| `COOKIE_SECURE` | `false` | Set to `true` when behind HTTPS (marks session cookies as Secure) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins for CORS and CSRF origin validation |
| `TRUSTED_PROXIES` | (none) | Comma-separated CIDRs for trusted reverse proxies (e.g. `172.16.0.0/12`). Only proxies in these ranges can set X-Forwarded-For / X-Real-IP headers |
| `SMTP_HOST` | (empty) | SMTP server hostname. When empty, email sending is disabled (invite falls back to admin-set password) |
| `SMTP_PORT` | `587` | SMTP port. Use `1025` for mailpit dev, `465` for implicit TLS, `587` for STARTTLS |
| `SMTP_USERNAME` | (empty) | SMTP authentication username |
| `SMTP_PASSWORD` | (empty) | SMTP authentication password |
| `SMTP_FROM` | `noreply@localhost` | Sender email address |
| `APP_URL` | `http://localhost:3000` | Base URL for verification links in emails |
| `ENCRYPTION_KEY` | (empty) | 32-byte hex key (64 chars) for AES-256-GCM encryption of TOTP secrets. Generate with `openssl rand -hex 32`. Required for 2FA |

### Reverse Proxy Requirements

When deploying behind a reverse proxy (nginx, Caddy, Traefik):

1. **TLS termination** — the proxy should handle HTTPS. Set `COOKIE_SECURE=true` on the API.
2. **HSTS header** — add `Strict-Transport-Security: max-age=63072000; includeSubDomains` at the proxy level.
3. **Forwarded headers** — configure the proxy to set `X-Real-IP` and `X-Forwarded-For` headers. Add the proxy's IP range to `TRUSTED_PROXIES`.
4. **CORS origin** — set `CORS_ORIGINS` to your actual domain (e.g. `https://finance.example.com`).

### First-Time Setup

1. Start the stack: `docker compose up -d`
2. Open the frontend URL — you'll see the "Create First Account" screen
3. Create the admin user with email and password (minimum 8 characters)
4. Invited users receive a verification email with a link to set their own password

### Manual Testing Guide

After `docker compose up -d --build`:

**1. Initial setup**
- Open http://localhost:3000 — you see "Create First Account"
- Create admin with email + password (min 8 chars) — you're logged in

**2. Email-based invite (with mailpit)**
- Click "Users" in the top bar → enter an email → "Invite User"
- Open http://localhost:8025 (mailpit) → see the invite email → click the verification link
- Set a password on the verification page → auto-logged in as the new user

**3. TOTP 2FA setup**
- Click "Security" → "Enable 2FA"
- Scan the QR code with your authenticator app (or enter the secret manually)
- Enter the 6-digit code → see recovery codes → save them
- Log out → log back in → after password, you'll see the TOTP code prompt

**4. Recovery code login**
- On the TOTP prompt, click "Use a recovery code instead"
- Enter one of the saved codes → logged in
- That code is now consumed (second use will fail)

**5. Admin-enforced 2FA**
- As admin, use the API: `curl -b cookies.txt -X POST http://localhost:8081/api/auth/settings/require-2fa -H 'Content-Type: application/json' -d '{"require":true}'`
- Any user without 2FA will see a mandatory setup screen on next login

**6. Account deletion**
- Click "Security" → "Delete Account" → enter password → account and all data are removed
- Audit log retains an anonymized entry

**7. Audit log inspection**
- Connect to the DB: `docker compose exec db psql -U finance -d finance`
- Query: `SELECT id, user_id, event, ip_address, created_at FROM audit_log ORDER BY id DESC LIMIT 20;`

### Production Mail Server Setup (VPS)

For production, replace mailpit with a real SMTP relay. Three common options:

**Option A: External SMTP service (recommended)**

Use a transactional email service like [Resend](https://resend.com), [Mailgun](https://mailgun.com), or [Amazon SES](https://aws.amazon.com/ses/). These handle deliverability, SPF/DKIM, and bounce management.

```yaml
# docker-compose.prod.yml (override)
services:
  api:
    environment:
      SMTP_HOST: "smtp.resend.com"
      SMTP_PORT: "465"
      SMTP_USERNAME: "resend"
      SMTP_PASSWORD: "re_your_api_key_here"
      SMTP_FROM: "noreply@yourdomain.com"
      APP_URL: "https://finance.yourdomain.com"
      ENCRYPTION_KEY: "your-64-char-hex-key"
      COOKIE_SECURE: "true"
```

DNS records needed for your domain:
- **SPF**: `v=spf1 include:resend.com ~all` (or your provider's include)
- **DKIM**: Add the TXT record your provider gives you
- **DMARC**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com`

**Option B: Postfix on the VPS**

Run Postfix locally on the VPS, only for outbound mail:

```sh
# Install on Debian/Ubuntu
apt install postfix libsasl2-modules
# Choose "Internet Site", set your hostname
```

```yaml
services:
  api:
    environment:
      SMTP_HOST: "host.docker.internal"  # or the VPS IP
      SMTP_PORT: "25"
      SMTP_FROM: "noreply@yourdomain.com"
      APP_URL: "https://finance.yourdomain.com"
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Configure Postfix as a relay through your provider (Resend, SES, etc.) for better deliverability. Direct sending from a VPS IP without a relay often lands in spam.

**Option C: Disable email, use password fallback**

If you don't need email verification (single-user setup), simply omit `SMTP_HOST`. The invite flow falls back to admin-set passwords with mandatory password change on first login.

**Security checklist for production:**
- [ ] Generate a unique `ENCRYPTION_KEY` with `openssl rand -hex 32`
- [ ] Set `COOKIE_SECURE=true`
- [ ] Set `CORS_ORIGINS` to your actual domain
- [ ] Set `TRUSTED_PROXIES` to your reverse proxy CIDR
- [ ] Configure SPF, DKIM, DMARC for your sending domain
- [ ] Remove mailpit from docker-compose (or don't start it)
- [ ] Ensure the `ENCRYPTION_KEY` is backed up — losing it makes existing 2FA secrets unrecoverable

## Tech Stack

- **Frontend:** Svelte 5 + Vite (SPA, talks to Go API)
- **Backend:** Go (REST API)
- **Database:** PostgreSQL
- **Deployment:** Docker Compose (3 containers: frontend, API, Postgres)

## Future Ideas

### Bank API Integration (Open Banking)

Swiss banks don't yet offer personal API keys in e-banking. Instead, the ecosystem centers on **SIX bLink**, a platform that brokers data access between banks and licensed third-party apps.

**Current state (as of Nov 2025):**

- bLink multibanking launched for retail customers with UBS, ZKB, PostFinance, Valiant, BEKB, Aargauische KB, Luzerner KB, Hypi Lenzburg, and Banque CIC. 30+ banks support the data interface.
- Raiffeisen is **not yet participating** in the multibanking initiative. Their open banking offering is business-customer only.
- Becoming a bLink "Service User" requires a legal entity, commercial register entry, IT security audit, and an admission test — not feasible for a personal self-hosted project.

**Practical path for nafin-toolbox:**

1. **Short term: CSV/file import** — All Swiss banks allow transaction export from e-banking. Support the common formats (CSV, MT940) per bank.
2. **Medium term: Aggregator API** — Services like Salt Edge cover Swiss banks and offer a commercial API. This avoids bLink admission but requires a paid relationship.
3. **Long term: Direct API access** — The Swiss Federal Council has demanded measurable open banking progress by end of 2025, with regulatory intervention as fallback. If PSD2-style regulation arrives, banks may be required to offer direct customer-authorized API access.

**Per-bank notes:**

| Bank | Developer Portal | Retail API | bLink Multibanking |
|---|---|---|---|
| UBS | [developer.ubs.com](https://developer.ubs.com) | Via bLink only | Yes |
| ZKB | [zkb.ch API portal](https://www.zkb.ch/de/lps/unternehmen/digitales-banking/api-developer-portal.html) (sandbox available) | Via bLink only | Yes |
| Raiffeisen | None for CH (only AT/International) | Not available | Not yet |
