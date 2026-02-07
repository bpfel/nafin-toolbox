# nafin-toolbox - Project Context

## What This Is
A self-hosted personal finance web app for a Swiss user. Covers budgeting, account management, monthly allocations, pillar 3a retirement provisions, and pillar 3b investments.

## Key Domain Knowledge
- **Pillar 3a:** Swiss tax-advantaged retirement savings. Has a legal annual contribution cap. Funds are locked until retirement (with exceptions like home purchase).
- **Pillar 3b:** Flexible savings/investment category. No contribution cap. Includes traded securities, physical gold, and unlisted stocks.
- **Base currency:** CHF (Swiss Franc). Some investments may be in USD/EUR.

## Architecture Decisions

### Modularity (core principle)
- The app starts completely empty — no default accounts, categories, or modules.
- Each domain (Budget, Accounts, Allocations, 3a, Investments) is an independent module the user opts into.
- Modules are self-contained: you can use any subset without the others.
- Cross-cutting views (net worth dashboard, snapshots) dynamically aggregate only the active modules.
- UI uses progressive disclosure: simple setup first, advanced config revealed as needed.
- Backend should reflect this: modules are loosely coupled, share a common interface for net-worth contribution, but don't depend on each other.

### Tech Stack
- **Frontend:** Svelte 5 + Vite — pure SPA, no SvelteKit (server role belongs to Go)
- **Backend:** Go — REST API, compiled single binary
- **Database:** PostgreSQL
- **Deployment:** Docker Compose with 3 services: `frontend` (nginx serving static build), `api` (Go binary), `db` (Postgres)
- Frontend communicates with backend exclusively via JSON REST API
- Go API serves under `/api/` prefix; frontend served separately via nginx

## Project Structure
```
nafin-toolbox/
├── docker-compose.yml              # 3 services: db, api, frontend
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── main.go                     # Entry point
│   ├── internal/
│   │   ├── server/server.go        # HTTP server, chi router, CORS, route registration
│   │   ├── database/db.go          # PostgreSQL connection via pgx
│   │   └── module/module.go        # Module type + NetWorthContributor interface
│   └── migrations/
│       └── 001_init.sql            # Modules table
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf                  # Serves SPA + proxies /api/ to Go
│   ├── package.json
│   ├── vite.config.ts              # Dev proxy for /api/
│   ├── index.html
│   └── src/
│       ├── main.ts                 # Svelte mount
│       ├── App.svelte              # Root component (empty-state → module cards)
│       ├── app.css                 # Global styles
│       └── lib/api/client.ts       # Typed API client (fetchModules, healthCheck)
```

### How to add a new module (backend)
1. Create `internal/<module>/` with `handler.go`, `model.go`, `store.go`
2. Add a migration in `migrations/`
3. Register routes in `server.go` under `/api/<module>`
4. Optionally implement `NetWorthContributor` for net worth aggregation

### How to add a new module (frontend)
1. Create `src/modules/<module>/` with Svelte components
2. Add API functions to `lib/api/client.ts`
3. Wire into App.svelte (or future router)

## Investment Valuation Strategy
- **Traded securities:** Fetch prices via financial data API (Yahoo Finance, Alpha Vantage, or similar). Need an API key. Cache prices to avoid rate limits.
- **Physical gold:** Store weight in grams/ounces. Multiply by gold spot price from API.
- **Unlisted stocks:** User enters valuations manually with a date. Latest entry = current value.

## Data Model (Draft Concepts)
- `Account` — name, type (bank/savings/cash), currency, balance
- `Budget` — month, category, planned amount, actual amount
- `Allocation` — month, source (income), target account, planned amount, actual amount
- `Provision3a` — provider, fund, contributions (yearly), current value
- `Investment` — name, type (stock/etf/gold/unlisted), ticker (nullable), quantity, purchase_price, purchase_date
- `Valuation` — investment_id, date, price (for manual entries)
- `Snapshot` — date, total_net_worth, breakdown by domain

## Development Workflow Conventions

### Git Worktrees — CRITICAL
**Always check which worktree you are working in before making any changes.**

Active worktrees:
| Worktree path | Branch | Purpose |
|---|---|---|
| `/home/bpfel/nafin-toolbox/` | `develop` (main repo) | Base code, shared infrastructure |
| `/home/bpfel/nafin-toolbox-budget/` | `feature/budget` | Budget module development |

**Rules:**
- **Before writing or editing any file**, verify the file path starts with the correct worktree root for the feature you are working on.
- Feature work (e.g. budget module) MUST go in the feature worktree, NOT the main repo.
- If the user asks you to implement a feature that has an associated worktree, make all changes in that worktree.
- When in doubt, run `git branch --show-current` in the target directory to confirm.

### Creating new worktrees
When creating git worktrees for parallel feature development:
1. Create the worktree from the appropriate base branch (usually `main`)
2. **Always create a symlink for the `.claude/` directory** to ensure all worktrees share the same Claude Code configuration:
   ```bash
   ln -s /home/bpfel/nafin-toolbox/.claude <new-worktree-path>/.claude
   ```
3. This ensures consistent agent memory, settings, and permissions across all feature branches
4. Update the worktree table above when adding or removing worktrees

## Open Questions
- Single-user auth or multi-user?
- Which financial data API for stock/ETF prices?
- How to handle currency conversion (live rates or manual)?
- Mobile-friendly responsive design or desktop-only?
