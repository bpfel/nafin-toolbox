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
- **Authentication** (single-user or simple auth, self-hosted)

## Development

Run the full stack locally:

```sh
docker compose up -d --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8081

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
4. Additional users can be invited from the admin panel (they'll be forced to change their temporary password on first login)

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
