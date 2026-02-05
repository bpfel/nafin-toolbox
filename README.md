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

## Tech Stack

- **Frontend:** Svelte 5 + Vite (SPA, talks to Go API)
- **Backend:** Go (REST API)
- **Database:** PostgreSQL
- **Deployment:** Docker Compose (3 containers: frontend, API, Postgres)
