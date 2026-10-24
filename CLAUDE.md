# nafin-toolbox - Project Context

## What This Is
A self-hosted personal finance web app for a Swiss audience. Covers budgeting, account management, allocations, pillar 3a retirement provisions, and pillar 3b investments.

**Multi-user.** The app already serves several users and the goal is to make it easily available to more. It is not a single-person tool, and design decisions should not assume one. In particular: anything shown to a user as a number they might act on — a tax estimate, an insurance premium — carries real weight, because users will trust it rather than eyeball it. Prefer asking for a figure the user already has over estimating one for them.

**Swiss-specific by design.** Being built for the Swiss financial landscape is the point, not a
localisation detail. Pillar 3a and its annual cap, QR bills, cantonal tax structure, Grundversicherung
and its franchise — these are features, and more will be added. When a generic design and a
Swiss-accurate one diverge, prefer the Swiss one and name the specificity explicitly rather than
abstracting it away. Conversely, do not invent Swiss facts: figures that vary by canton, year or
personal situation should be asked for, not estimated (see above).

## Key Domain Knowledge
- **Pillar 3a:** Swiss tax-advantaged retirement savings. Has a legal annual contribution cap. Funds are locked until retirement (with exceptions like home purchase).
- **Pillar 3b:** Flexible savings/investment category. No contribution cap. Includes traded securities, physical gold, and unlisted stocks.
- **Base currency:** CHF (Swiss Franc). Some investments may be in USD/EUR.

## Architecture Decisions

### Modularity (core principle)
**The app starts empty of _data_, not of features.** Every screen is present from the first
sign-in; a screen with nothing in it explains what it is for and offers the one action that
starts it. Nothing is seeded on the user's behalf — the first franc in the app is one they
typed.

This replaced opt-in modules, which the user administered from a picker. That picker could
not do the job asked of it: a name and one line of description is not enough to decide
whether Allocations is worth an evening, so the feature most in need of explaining was the
one nobody could see.

The modularity that mattered was always architectural, and it stands:
- Modules are self-contained: no module may require another to function, and each degrades
  to its empty state alone. Accounts must not break because Budget is empty.
- Cross-cutting views (net worth dashboard, snapshots) aggregate whatever modules hold data.
- Backend stays loosely coupled, sharing a common interface for net-worth contribution.
- UI uses progressive disclosure: simple setup first, advanced config revealed as needed.

**Empty is not the same as unbuilt.** A screen earns its place in the navigation when the
feature behind it exists and the user simply has no data yet. Pillar 3a and Investments are
not built, so there is no Savings destination — it appears when there is something behind
it, which is one line in `lib/nav/destinations.ts`.

### Navigation
- Destinations are data (`lib/nav/destinations.ts`), rendered as a bottom bar under 768px
  and a left rail above. A user gets Budget · Belege · Accounts · Knowledge · Profile — five,
  checked at 320px in every locale; a sixth is a decision, not an arrival. An admin gets a
  different list — Users · Audit · Upkeep · Profile — because an admin has no vault and
  cannot budget.
- A screen may pin its main action (`ActionButton pinned`): on a phone it stays out above
  the dial's dot while the dial is closed, one tap where the thumb is. Belege pins its "+".
- Two levels, hard stop: a screen and a sub-tab (`/accounts/allocations`). Anything deeper
  is a modal or a disclosure, not a place.
- Tab switches push onto history, so the browser back gesture undoes the last move.
- `lib/nav/gate.ts` decides which enforcement screen stands in the way, if any. The URL must
  never decide that — a gate suspends the route rather than replacing it, so unlocking lands
  you where you asked to go.

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
├── docker-compose.yml              # 3 services: db, api, frontend — no ports published
├── docker-compose.override.yml     # Dev ports; Compose loads it when no -f is given
├── docker-compose.prod.yml         # Production overrides; publishes the frontend only
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
│   │   ├── apierror/               # Error codes the frontend translates
│   │   └── vault/                  # E2EE vault storage: encrypted MEK + vault blobs
│   └── migrations/                 # 001_init, then three that retire what the shell dropped
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
│       ├── screens/                # One file per navigation destination
│       ├── lib/
│       │   ├── nav/                # Router, gate chain, bar/rail, screen header
│       │   ├── api/client.ts       # Typed API client
│       │   ├── auth/               # Auth UI components + authStore
│       │   ├── crypto/             # E2EE: key derivation, vault encrypt/decrypt, vaultStore
│       │   ├── budget/             # Budget engine: categories, entries, plan, snapshots
│       │   ├── accounts/           # Account, reserve and routing math (all pure)
│       │   ├── i18n/               # Five locales + the untranslated scan
│       │   └── util/               # Money, privacy, edit mode, focus trap, swipe
│       └── modules/
│           ├── budget/             # Budget UI (table, summary, modals, snapshots)
│           └── accounts/           # management/ (cards, forms) + allocations/ (routing)
```

### How to add a new module (backend)
1. Create `internal/<module>/` with `handler.go`, `model.go`, `store.go`
2. Add a migration in `migrations/`
3. Register routes in `server.go` under `/api/<module>`

There is no module registry to enrol in — `internal/module/` and the `modules` table
were both retired when the picker was. A backend package exists only if the module needs
the server for something the vault cannot do.

### How to add a new module (frontend)
1. Create `src/modules/<module>/` with Svelte components
2. Add engine/logic to `src/lib/<module>/` if needed
3. Add API functions to `lib/api/client.ts` for any backend endpoints
4. Add a destination in `lib/nav/destinations.ts` and a screen in `src/screens/` — but only
   once the feature behind it exists (see **Empty is not the same as unbuilt**)
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
- `user_vaults` — encrypted vault blobs (opaque to server)

### Encrypted Vault (frontend, inside `VaultData`, currently v11)

**Naming, since it changed three times and older commits will read differently.**

A **category** is a heading — Housing, Employment. An **entry** is a line under
it — Rent, Salary. Before v5 these were called a *group* and a *category*, which
collided with the accounts module's own use of "category". Anything written
before v5 means the old pair.

A **snapshot** is a named frozen copy of the plan; the **Archive** is the one
place they are kept. Before v6 each snapshot was itself called an *archive*,
which used one word in two senses — the heading meant the collection, each item
meant a packaged copy — and made "archive the plan" read as retiring it.
Anything written before v6 means the old word. Note `entry.archived` is
unrelated: that is the flag that hides a budget entry.

An entry has one of **five types**, not two. Before v7 it was income or expense
and a separate `ReserveDefinition.kind` said which kind of saving it was;
*obligation* and *amortization* were the two kinds, and both were unusable in a
Swiss app — *obligation* is the ordinary French and German word for a bond, and
*Amortisation* is paying down mortgage principal. They are **`bill`** ("a bill
that will arrive") and **`purchase`** ("something to replace") now. Anything
written before v7 means the old words, and means `category.type` where the field
is `category.side`.

- `EntryType` — `income | expense | savings | bill | purchase`. Three helpers in
  `vault.ts` read it so nothing branches on the literals: `sideOf` (which half of
  the budget), `holdsMoney` (leaves the account but not the net worth — savings,
  bill, purchase), `savesTowardsTarget` (carries a `reserve` — bill, purchase)
- `VaultCategory` — name, **`side`** (income/expense), sort order. A heading's
  side and an entry's type could not both be called `type` once the second grew
  past two values: a Housing heading holds Rent and a roof fund alike
- `VaultEntry` — name, `type`, sort order, archived flag, `categoryId`, routing
  (`sourceAccountId` / `sinkAccountId`), optional `reserve`, optional `automatic`
  (paid by standing order: Belege offers it for no receipt and counts it as paid at its plan)
- `ReserveDefinition` — `targetAmount`, `periodMonths`, `anchorMonth`. No `kind`:
  the entry type is the discriminator, so the schedule is recorded once and
  `reserveMath` branches on the type directly
- `VaultPlanEntry` — `entryId`, planned amount. One standing plan, not per month
- `VaultSnapshot` — a copy of the plan; its lines are denormalised to
  `entryName` / `categoryName` (with `entryId` and `automatic` beside them) so they survive
  a later rename or delete. Every snapshot is a **month's copy** (`month: 'YYYY-MM'`),
  taken by the app as each month ends — the plan's history, and the plan Belege reads that
  month against. Budget steps back through *versions*: runs of months with identical copies
  (`lib/budget/versions.ts`), each past one listing what changed after it
  (`lib/budget/changes.ts`). Snapshots taken by hand (with a name, before months were kept)
  were retired pre-beta and are dropped on load
  `budget.openMonth` is the month being recorded; set when the plan is made (or upgraded),
  so no history before it is invented
- `VaultAccount` — name, kind, currency, `currentAmount` as at `lastCorrectedAt`
  (an anchor pair, never a running total), optional bank/IBAN/holder for QR bills
- `people` (v10) — what a household calls its members, by user id. Set by the owner only;
  kept after a member leaves. Empty in a personal vault
- `Beleg` (v11) — one receipt: `date`, `amount`, `entryId` (expense entries only; `null` is
  Unassigned), optional `note`; in a household `paidBy` (a user id or `'joint'`) and the
  `shares` copied from `split` when it was entered. Called a *record* in code. A record is
  never dropped: if its entry goes, it becomes Unassigned
- A finished month's copy is taken by the first write after it ends — no server job: the
  server cannot read the plan, and the plan only changes through the app — so it is the
  plan as the month ended. Months nobody wrote in get the same copy as the month before
- `settlements` and `split` (v11) — households only: payments that even balances out, and
  how a new record is divided (equal, or a percentage per member adding to 100)

### Future modules (not yet implemented)
- `Account` — name, type (bank/savings/cash), currency, balance
- `Allocation` — month, source (income), target account, planned amount, actual amount
- `Provision3a` — provider, fund, contributions (yearly), current value
- `Investment` — name, type (stock/etf/gold/unlisted), ticker (nullable), quantity, purchase_price, purchase_date
- `Valuation` — investment_id, date, price (for manual entries)
- `Snapshot` — date, total_net_worth, breakdown by domain

## Development Workflow Conventions

### Security fixes update SECURITY.md — every time
`SECURITY.md` is the public record of what is protected and what is not. A change
that fixes a vulnerability, or removes or narrows a known limitation, updates it
**in the same pull request**:

- add the fix under **Security fixes**, in a section for the upcoming release
  ("Unreleased" until it is cut, then renamed with the version and date);
- move or reword the matching item under **Known limitations**, so that nothing
  there is claimed after it stops being true, and nothing fixed is still listed;
- add a new limitation when a change knowingly introduces one;
- update `readmore/security.md` too when the behaviour a user or operator sees
  changes, and the CHANGELOG's *Security* section.

An **exploitable, unfixed** vulnerability is never described in a public issue, pull
request or commit message: it goes in a private GitHub security advisory until the
fix ships. Design limitations users should know about belong in `SECURITY.md`
openly.

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
