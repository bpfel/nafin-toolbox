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

Run the full stack locally via the dev compose override:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- Frontend (Vite dev server): http://localhost:5173
- API: http://localhost:8081

> **Note:** The frontend Vite dev server proxies `/api` requests to the `api` Docker service. Running the frontend outside of Docker Compose is not supported — always use the dev compose setup.

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

## Tech Stack

- **Frontend:** Svelte 5 + Vite (SPA, talks to Go API)
- **Backend:** Go (REST API)
- **Database:** PostgreSQL
- **Deployment:** Docker Compose (3 containers: frontend, API, Postgres)
