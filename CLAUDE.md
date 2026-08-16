# nafin-toolbox - Project Context

## What This Is
A self-hosted personal finance web app for a Swiss audience. Covers budgeting, account management, allocations, pillar 3a retirement provisions, and pillar 3b investments.

**Multi-user.** The app already serves several users and the goal is to make it easily available to more. It is not a single-person tool, and design decisions should not assume one. In particular: anything shown to a user as a number they might act on — a tax estimate, an insurance premium — carries real weight, because users will trust it rather than eyeball it. Prefer asking for a figure the user already has over estimating one for them.

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
├── docker-compose.prod.yml         # Production overrides
├── .github/workflows/test.yml      # CI: unit, frontend, integration tests
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── main.go                     # Entry point
│   ├── internal/
│   │   ├── server/server.go        # HTTP server, chi router, CORS, route registration
│   │   ├── database/               # PostgreSQL connection (pgx) + migration runner
│   │   ├── auth/                   # Authentication: handlers, store, middleware, TOTP, rate limiting, audit
│   │   ├── email/                  # SMTP client + HTML email templates
│   │   ├── module/                 # Module type + NetWorthContributor interface
│   │   └── vault/                  # E2EE vault storage: encrypted MEK + vault blobs
│   └── migrations/
│       └── 001_init.sql            # Full schema (users, sessions, audit_log, modules, vaults)
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf                  # Serves SPA + proxies /api/ to Go
│   ├── package.json
│   ├── vite.config.ts              # Dev proxy for /api/
│   ├── index.html
│   └── src/
│       ├── main.ts                 # Svelte mount
│       ├── App.svelte              # Root component
│       ├── app.css                 # Global styles
│       ├── lib/
│       │   ├── api/client.ts       # Typed API client
│       │   ├── auth/               # Auth UI components + authStore
│       │   ├── crypto/             # E2EE: key derivation, vault encrypt/decrypt, vaultStore
│       │   └── budget/             # Budget engine: categories, periods, entries, BFS defaults
│       └── modules/
│           └── budget/             # Budget module UI (table, summary, modals, setup)
```

### How to add a new module (backend)
1. Create `internal/<module>/` with `handler.go`, `model.go`, `store.go`
2. Add a migration in `migrations/`
3. Register routes in `server.go` under `/api/<module>`
4. Optionally implement `NetWorthContributor` for net worth aggregation

### How to add a new module (frontend)
1. Create `src/modules/<module>/` with Svelte components
2. Add engine/logic to `src/lib/<module>/` if needed
3. Add API functions to `lib/api/client.ts` for any backend endpoints
4. Wire into App.svelte (or future router)
5. For E2EE modules: store data in the vault (`VaultData` in `lib/crypto/vault.ts`), not via backend API

## Investment Valuation Strategy
- **Traded securities:** Fetch prices via financial data API (Yahoo Finance, Alpha Vantage, or similar). Need an API key. Cache prices to avoid rate limits.
- **Physical gold:** Store weight in grams/ounces. Multiply by gold spot price from API.
- **Unlisted stocks:** User enters valuations manually with a date. Latest entry = current value.

## Data Model

### PostgreSQL (backend)
- `users` — email, password_hash, role (admin/user), verification, TOTP secrets
- `sessions` — hashed session tokens, expiry, user association
- `audit_log` — security event log (user_id nullable for anonymization)
- `modules` — enabled module registry per user
- `user_vaults` — encrypted vault blobs (opaque to server)

### Encrypted Vault (frontend, inside `VaultData`)
- `VaultCategoryGroup` — name, type (income/expense), sort order
- `VaultCategory` — name, type, group, fixed flag, archived flag
- `VaultPeriod` — year, month, notes, entries
- `VaultEntry` — category reference, planned/actual amounts

### Future modules (not yet implemented)
- `Account` — name, type (bank/savings/cash), currency, balance
- `Allocation` — month, source (income), target account, planned amount, actual amount
- `Provision3a` — provider, fund, contributions (yearly), current value
- `Investment` — name, type (stock/etf/gold/unlisted), ticker (nullable), quantity, purchase_price, purchase_date
- `Valuation` — investment_id, date, price (for manual entries)
- `Snapshot` — date, total_net_worth, breakdown by domain

## Development Workflow Conventions

### Git Worktrees — CRITICAL
**Always check which worktree you are working in before making any changes.**

**Never rely on a recorded list of worktrees — not in this file, not in agent memory.**
Worktrees and their branches change constantly; any written-down list is stale the moment
someone switches a branch or adds a worktree. Always determine the current state live:

```bash
git worktree list          # every worktree and the branch each has checked out
git branch --show-current  # branch of the worktree you are standing in
git status --porcelain     # uncommitted work that would follow a branch switch
```

**Rules:**
- **Run `git worktree list` before starting work**, and confirm which worktree the task belongs in.
- **Before writing or editing any file**, verify the file path starts with the correct worktree root for the feature you are working on.
- Feature work MUST go in the feature worktree, NOT the main repo.
- If the user asks you to implement a feature that has an associated worktree, make all changes in that worktree.
- Uncommitted changes belong to no branch — they follow you across a checkout. Check `git status` before switching.

### Creating new worktrees
When creating git worktrees for parallel feature development:
1. Create the worktree from the appropriate base branch (usually `main`)
2. **Always create a symlink for the `.claude/` directory** to ensure all worktrees share the same Claude Code configuration:
   ```bash
   ln -s /home/bpfel/nafin-toolbox/.claude <new-worktree-path>/.claude
   ```
   The link target is the main repo's real `.claude/` directory. **Never run this with
   `<new-worktree-path>` set to the main repo itself** — that makes `.claude` a symlink to
   itself and every settings read fails with `ELOOP`.
3. This ensures consistent agent memory, settings, and permissions across all feature branches
4. Do not record the new worktree anywhere — `git worktree list` is the only source of truth

**`.claude/` is gitignored and must stay that way.** It is local, machine-specific config
shared between worktrees by symlink. It was previously committed as a symlink holding an
absolute path, which broke settings on every branch and every clone. If `git status` ever
shows `.claude` as a tracked or staged file, that is a regression — untrack it.

## Open Questions
- Which financial data API for stock/ETF prices?
- How to handle currency conversion (live rates or manual)?
- Mobile-friendly responsive design or desktop-only?
