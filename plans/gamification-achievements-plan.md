# Gamification & Achievement System — Implementation Plan

## Context

The app currently starts with an empty dashboard and no guidance. The modular, opt-in architecture maps naturally to a personal finance learning journey. This plan adds an achievement system that:

- **Educates**: each unlock includes a short Swiss-specific finance lesson
- **Motivates**: tracks progress through 5 chapters (one per domain module)
- **Guides**: provides a clear path from "financial awareness" to "wealth building"
- **Respects the user**: enabled by default, one toggle to opt out

Since no domain modules exist yet, this builds the **infrastructure** — domain modules will hook into it via simple function calls as they're implemented.

---

## What Gets Built

| Layer | New Files | Modified Files |
|-------|-----------|----------------|
| Migration | `backend/migrations/002_achievements.sql` | — |
| Backend | 7 files across `internal/settings/` and `internal/achievement/` | `internal/server/server.go` |
| Frontend | 7 new components/stores | `src/App.svelte`, `src/lib/api/client.ts`, `src/app.css` |

---

## Phase 1: Database & Settings

### 1.1 Migration — `backend/migrations/002_achievements.sql`

```sql
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('achievements_enabled', 'true')
    ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS achievement_unlocks (
    achievement_id TEXT PRIMARY KEY,
    unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievement_progress (
    achievement_id TEXT NOT NULL,
    counter_key    TEXT NOT NULL,
    counter_value  INTEGER NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (achievement_id, counter_key)
);
```

**Design**: Achievement definitions live in Go code (version-controlled, type-checked). DB only stores mutable user state (what's unlocked, progress counters). `settings` is a generic key-value table reusable for future features.

### 1.2 Settings package — `backend/internal/settings/`

- **`store.go`**: `Get(ctx, key)`, `Set(ctx, key, value)`, `GetAll(ctx)` — simple key-value CRUD
- **`handler.go`**: `Routes(db) func(chi.Router)` registering `GET /` and `PUT /{key}`

### 1.3 Wire into server.go

Add `r.Route("/settings", settings.Routes(s.db))` in the `/api` route group.

**Verify**: `curl /api/settings` → `{"achievements_enabled":"true"}`

---

## Phase 2: Achievement Backend

### 2.1 Types — `backend/internal/achievement/model.go`

Key types:
- `Chapter` — ID, Number (1-5), Title, ModuleID, Description
- `Achievement` — ID, ChapterID, Name, Description, Tooltip (finance lesson), ConditionType (event/counter/check), Threshold, SortOrder
- `AchievementStatus` — API response shape with unlocked bool, timestamps, progress
- `ChapterStatus` — chapter + its achievements + unlocked/total counts
- `JourneyResponse` — `{enabled, chapters[], meta[]}` — full Journey page payload
- `UnlockEvent` — `{achievement_id, name, tooltip}` — returned inline with domain API responses

### 2.2 Registry — `backend/internal/achievement/registry.go`

Hardcoded Go definitions (single source of truth). 5 chapters + ~17 achievements:

| Chapter | Achievements |
|---------|-------------|
| **Ch 1: Know What You Have** (accounts) | First Step (enable), On the Books (first account), The Full Picture (3+ accounts) |
| **Ch 2: Know Where It Goes** (budget) | Budget Conscious (enable), Categorized (first category), Month One (full month) |
| **Ch 3: Give Every Franc a Job** (allocations) | Money with a Mission (enable), First Assignment (first allocation) |
| **Ch 4: Pay Your Future Self** (provision3a) | Future Thinker (enable), Retirement Saver (first contribution), Maxed Out (hit annual cap) |
| **Ch 5: Make Money Work For You** (investments) | Market Entrant (enable), First Position (first investment), Diversified (3 types) |
| **Meta** | Net Worth Unlocked (2+ modules), Complete Setup (5 modules), Swiss Army Finance (achievement in every chapter) |

Each achievement has an educational tooltip, e.g.:
- **Maxed Out**: *"Maximizing your 3a is often the single best financial move for Swiss taxpayers. The tax savings compound year over year."*
- **Diversified**: *"Diversification reduces risk without necessarily reducing returns. Mix stocks, bonds, real estate, and commodities."*

`Registry` struct provides lookups: `GetAchievement(id)`, `AllChapters()`, `AchievementsForChapter(chapterID)`.

#### Full Achievement Catalog

##### Chapter 1: Know What You Have (accounts)

| ID | Name | Trigger | Tooltip |
|----|------|---------|---------|
| `accounts_enable` | First Step | Enable module (event) | Knowing what accounts you have — checking, savings, cash — is the foundation of any financial plan. |
| `accounts_first` | On the Books | Add first account (event) | Every Swiss resident should know their bank accounts across all institutions. Fragmentation is the enemy of clarity. |
| `accounts_three` | The Full Picture | Track 3+ accounts (counter, threshold: 3) | Most Swiss households use 2–4 bank accounts. Seeing them all in one place prevents overdrafts and idle cash. |

##### Chapter 2: Know Where It Goes (budget)

| ID | Name | Trigger | Tooltip |
|----|------|---------|---------|
| `budget_enable` | Budget Conscious | Enable module (event) | A budget is not a restriction — it is a plan for your money. Research shows budgeters save 20% more. |
| `budget_first_category` | Categorized | Create first budget category (event) | The 50/30/20 rule suggests: 50% needs, 30% wants, 20% savings. Categories help you see where you stand. |
| `budget_first_month` | Month One | Complete a full month of tracking (event) | The first month of tracking is always surprising. Most people discover 10–15% of spending they did not expect. |

##### Chapter 3: Give Every Franc a Job (allocations)

| ID | Name | Trigger | Tooltip |
|----|------|---------|---------|
| `allocations_enable` | Money with a Mission | Enable module (event) | Envelope budgeting has been used since the 1930s. Digital allocations are the modern equivalent. |
| `allocations_first` | First Assignment | Create first allocation (event) | Allocating money before spending it shifts your mindset from reactive to proactive financial management. |

##### Chapter 4: Pay Your Future Self (provision3a)

| ID | Name | Trigger | Tooltip |
|----|------|---------|---------|
| `provision3a_enable` | Future Thinker | Enable module (event) | Pillar 3a contributions are tax-deductible in Switzerland. In 2025, the annual cap is CHF 7,056 for employed persons. |
| `provision3a_first` | Retirement Saver | Record first 3a contribution (event) | Starting 3a contributions early matters enormously. CHF 7,000/year from age 25 to 65 at 5% return grows to over CHF 900,000. |
| `provision3a_max` | Maxed Out | Reach annual 3a cap (event) | Maximizing your 3a is often the single best financial move for Swiss taxpayers. The tax savings compound year over year. |

##### Chapter 5: Make Money Work For You (investments)

| ID | Name | Trigger | Tooltip |
|----|------|---------|---------|
| `investments_enable` | Market Entrant | Enable module (event) | Historically, diversified stock portfolios return 7–10% annually. Starting is more important than timing. |
| `investments_first` | First Position | Add first investment (event) | Switzerland has no capital gains tax on private investments. This is a significant advantage for long-term investors. |
| `investments_diversified` | Diversified | Hold 3 different investment types (counter, threshold: 3) | Diversification reduces risk without necessarily reducing returns. Mix stocks, bonds, real estate, and commodities. |

##### Meta / Cross-Cutting

| ID | Name | Trigger | Tooltip |
|----|------|---------|---------|
| `meta_two_modules` | Net Worth Unlocked | Enable 2+ modules (counter, threshold: 2) | Net worth = assets minus liabilities. Tracking it monthly is the single best predictor of long-term financial health. |
| `meta_all_modules` | Complete Setup | Enable all 5 modules (counter, threshold: 5) | A comprehensive financial view is rare. Most people only track one dimension. You now see the full picture. |
| `meta_swiss_army` | Swiss Army Finance | Unlock at least one achievement in every chapter (check) | Like a Swiss Army knife, your finance toolbox now covers every essential function. Versatility is power. |

### 2.3 Store — `backend/internal/achievement/store.go`

DB operations: `IsUnlocked`, `Unlock` (INSERT ON CONFLICT DO NOTHING), `GetAllUnlocks`, `GetProgress`, `IncrementProgress` (upsert + RETURNING), `SetProgress`, `GetAllProgress`.

### 2.4 Evaluator — `backend/internal/achievement/evaluator.go`

The core engine. Domain modules call these methods:

- **`OnEvent(ctx, achievementID)`** — directly unlocks an event-based achievement
- **`OnCounter(ctx, achievementID, delta)`** — increments counter, unlocks if threshold reached
- **`OnCounterSet(ctx, achievementID, value)`** — sets counter absolutely (for recount scenarios)
- **`RegisterCheckFunc(achievementID, func)`** — registers custom predicates for complex conditions (e.g., "Swiss Army Finance" checks if all 5 chapters have at least one unlock)

All methods silently no-op when achievements are disabled (`settings.achievements_enabled != 'true'`). All methods return `[]UnlockEvent` so callers can include them in API responses. After any unlock, meta achievements are automatically re-evaluated.

### 2.5 Handlers — `backend/internal/achievement/handler.go`

`Routes(db, evaluator) func(chi.Router)` registering:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/achievements/journey` | Full Journey page data (chapters, achievements, progress, enabled flag) |
| `GET /api/achievements` | Flat list of all achievements with status |
| `GET /api/achievements/{id}` | Single achievement detail |

### 2.6 Wire into server.go

- Add `evaluator *achievement.Evaluator` field to `Server` struct
- Create evaluator in `New()`, register meta check functions
- Add `r.Route("/achievements", achievement.Routes(s.db, s.evaluator))`

**Verify**: `curl /api/achievements/journey` → all chapters with all achievements locked

---

## Phase 3: First Integration Point — Module Enable

Add `POST /api/modules` endpoint to `server.go`:
- Accepts `{"id": "accounts", "name": "Accounts"}`
- Inserts into `modules` table
- Fires `evaluator.OnEvent(ctx, moduleID+"_enable")`
- Fires `evaluator.OnCounter(ctx, "meta_two_modules", 1)` and `"meta_all_modules"`
- Returns `{"module": {...}, "achievements": [...]}`

Also add `DELETE /api/modules/{id}` for disabling (decrements module counters).

**Verify**: POST to enable "accounts" → response includes `accounts_enable` achievement. Enable a second → `meta_two_modules` fires.

---

## Phase 4: Frontend — API & Infrastructure

### 4.1 API client additions — `frontend/src/lib/api/client.ts`

New types: `AchievementStatus`, `ChapterStatus`, `JourneyResponse`, `UnlockEvent`

New functions:
- `fetchJourney()` — GET `/api/achievements/journey`
- `fetchSettings()` — GET `/api/settings`
- `updateSetting(key, value)` — PUT `/api/settings/{key}`
- `enableModule(id, name)` — POST `/api/modules`
- `requestWithAchievements<T>(path, options)` — wrapper that auto-queues toast notifications for any `achievements` in the response

### 4.2 Achievement toast store — `frontend/src/lib/stores/achievements.svelte.ts`

Svelte 5 rune-based store managing a queue of `UnlockEvent[]`. Functions: `queueAchievementToasts(unlocks)`, `dismissToast()`, `getPendingToasts()`.

### 4.3 Navigation — `frontend/src/components/Navigation.svelte`

State-based page switching (no router library needed yet). Three tabs: Home, Journey, Settings. Receives `currentPage` and `onNavigate` as `$props()`.

### 4.4 Update App.svelte

- Import Navigation, AchievementToast, Journey, Settings
- Add `currentPage` state variable
- Render page based on state, mount toast globally

---

## Phase 5: Frontend — Journey Page & Components

### 5.1 `frontend/src/modules/achievements/AchievementCard.svelte`
- Locked state (greyed, lock icon) vs unlocked (green accent, checkmark)
- Progress bar for counter-based achievements (`progress/threshold`)
- Expandable educational tooltip on unlocked achievements

### 5.2 `frontend/src/modules/achievements/ChapterCard.svelte`
- Chapter number, title, description
- Progress bar (unlocked/total)
- List of AchievementCards

### 5.3 `frontend/src/modules/achievements/Journey.svelte`
- Fetches `/api/achievements/journey` on mount
- Renders chapters in order, then meta achievements as "Milestones"
- Shows disabled notice with link to settings if opted out

### 5.4 `frontend/src/modules/achievements/AchievementToast.svelte`
- Fixed-position banner (top-right)
- Shows achievement name + educational tooltip
- Auto-dismisses after 6 seconds, manual close button
- Processes queue one at a time

### 5.5 `frontend/src/components/Settings.svelte`
- Loads settings on mount
- Toggle switch for "Achievements & Journey" with description
- Calls `updateSetting('achievements_enabled', ...)` on toggle

### 5.6 CSS additions — `frontend/src/app.css`
- `.chapter-card`, `.achievement`, `.achievement.locked`, `.achievement.unlocked`
- `.progress-bar` / `.progress-fill` using existing green accent (#2d6a4f)
- `.achievement-toast` fixed positioning with slide-in animation
- `.educational-tooltip` with light blue background
- `.main-nav` with tab-style buttons
- `.settings` layout with toggle switch
- Follow existing conventions: flat classes, no nesting, system-ui font

---

## How Future Domain Modules Hook In

When a domain module is built (e.g., accounts), it:

1. Receives `*achievement.Evaluator` via its `Routes(db, evaluator)` function
2. After mutating actions, calls `eval.OnEvent(ctx, "accounts_first")` or `eval.OnCounterSet(ctx, "accounts_three", count)`
3. Includes returned `[]UnlockEvent` in its API response under `"achievements"` key
4. Frontend uses `requestWithAchievements<T>()` — toasts appear automatically

No interfaces to implement. No event bus. Just direct function calls.

---

## File Summary

### New files (14)
| File | Purpose |
|------|---------|
| `backend/migrations/002_achievements.sql` | Schema |
| `backend/internal/settings/store.go` | Settings CRUD |
| `backend/internal/settings/handler.go` | Settings API |
| `backend/internal/achievement/model.go` | Types |
| `backend/internal/achievement/registry.go` | Achievement definitions |
| `backend/internal/achievement/store.go` | DB operations |
| `backend/internal/achievement/evaluator.go` | Core engine |
| `backend/internal/achievement/handler.go` | Achievement API |
| `frontend/src/lib/stores/achievements.svelte.ts` | Toast queue |
| `frontend/src/components/Navigation.svelte` | Page nav |
| `frontend/src/components/Settings.svelte` | Settings page |
| `frontend/src/modules/achievements/Journey.svelte` | Journey page |
| `frontend/src/modules/achievements/ChapterCard.svelte` | Chapter display |
| `frontend/src/modules/achievements/AchievementCard.svelte` | Achievement display |
| `frontend/src/modules/achievements/AchievementToast.svelte` | Unlock notification |

### Modified files (4)
| File | Change |
|------|--------|
| `backend/internal/server/server.go` | Add evaluator field, create in New(), register achievement/settings routes, add POST/DELETE /api/modules |
| `frontend/src/lib/api/client.ts` | Add achievement types, journey/settings/module API functions, requestWithAchievements wrapper |
| `frontend/src/App.svelte` | Add Navigation, page routing, mount AchievementToast |
| `frontend/src/app.css` | Add styles for nav, chapters, achievements, toast, settings, progress bars |

---

## Verification

1. **Backend**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`
2. **Settings**: `curl localhost:8081/api/settings` → `{"achievements_enabled":"true"}`
3. **Journey (empty)**: `curl localhost:8081/api/achievements/journey` → all chapters, all locked
4. **Enable module**: `curl -X POST localhost:8081/api/modules -d '{"id":"accounts","name":"Accounts"}'` → response includes `accounts_enable` unlock
5. **Journey (progress)**: `curl localhost:8081/api/achievements/journey` → chapter 1 shows 1/3 unlocked
6. **Frontend**: Open `localhost:5173`, navigate to Journey page, see chapters and progress
7. **Opt-out**: Settings page → toggle off → achievements stop firing, Journey shows disabled notice
8. **Toast**: Enable a module → toast appears with achievement name and finance lesson
